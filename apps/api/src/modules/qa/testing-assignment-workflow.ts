import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  PERMISSIONS,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type PermissionKey,
  type TestingAssignmentKind,
  type TestingAssignmentStatus,
} from '@ashniva/types';

/**
 * When a testing assignment may move, who may move it, and why not.
 *
 * The same two-check arrangement as AI summaries: `@RequirePermissions` on the route answers "may
 * this person record results at all", and this answers "may they do it to this assignment right
 * now". Both have to hold, so holding `qa:record-result` cannot pass a production sign-off that
 * `qa:verify-live` is supposed to gate.
 *
 * One state machine for all four kinds. QA, retest, live verification and UAT have the same
 * lifecycle and differ only in audience and environment; four machines would be four things that
 * have to agree. Where a kind really is different, the action table says so (`onlyKinds` /
 * `notKinds`) rather than the states forking.
 */

const S = TESTING_ASSIGNMENT_STATUS;
const K = TESTING_ASSIGNMENT_KIND;

/** The only moves that exist. Everything else is a bug or an attack, and both fail closed. */
export const TESTING_ASSIGNMENT_TRANSITIONS: Record<
  TestingAssignmentStatus,
  readonly TestingAssignmentStatus[]
> = {
  [S.PENDING]: [S.IN_PROGRESS, S.CANCELLED],
  [S.IN_PROGRESS]: [S.PASSED, S.FAILED, S.CLARIFICATION, S.CANCELLED],
  // A tester who asked a question picks the work back up once it is answered.
  [S.CLARIFICATION]: [S.IN_PROGRESS, S.CANCELLED],
  // Terminal. A second opinion is a new assignment, not an edited old one — the same reason
  // test_results is append-only: "it passed on the retest" is the fact somebody later needs.
  [S.PASSED]: [],
  [S.FAILED]: [],
  [S.CANCELLED]: [],
};

export function canTransitionTestingAssignment(
  from: TestingAssignmentStatus,
  to: TestingAssignmentStatus,
): boolean {
  return TESTING_ASSIGNMENT_TRANSITIONS[from].includes(to);
}

/** Non-terminal statuses: what "still owed" means in the tester's queue. */
export const OPEN_TESTING_ASSIGNMENT_STATUSES: readonly TestingAssignmentStatus[] = [
  S.PENDING,
  S.IN_PROGRESS,
  S.CLARIFICATION,
];

export type TestingAssignmentAction =
  'start' | 'pass' | 'fail' | 'clarify' | 'verifyLive' | 'cancel';

interface ActionRule {
  to: TestingAssignmentStatus;
  from: readonly TestingAssignmentStatus[];
  /** Every one of these must be held. */
  permissions: readonly PermissionKey[];
  /**
   * Only the person the assignment is on may do this. An unassigned assignment is claimable by
   * anyone holding the permission — that is what the "ready" queue is for. A lead is deliberately
   * not an exception: recording somebody else's result would put a name on evidence they did not
   * gather.
   */
  assigneeOnly?: boolean;
  onlyKinds?: readonly TestingAssignmentKind[];
  notKinds?: readonly TestingAssignmentKind[];
  requiresNote?: boolean;
}

export const TESTING_ASSIGNMENT_ACTIONS: Record<TestingAssignmentAction, ActionRule> = {
  start: {
    to: S.IN_PROGRESS,
    from: [S.PENDING, S.CLARIFICATION],
    permissions: [PERMISSIONS.QA_RECORD_RESULT],
    assigneeOnly: true,
    notKinds: [K.UAT],
  },
  pass: {
    to: S.PASSED,
    from: [S.IN_PROGRESS],
    permissions: [PERMISSIONS.QA_RECORD_RESULT],
    assigneeOnly: true,
    // A live verification passes through `verifyLive` and nowhere else. Without this, anyone who
    // can record a staging result could sign off production and `qa:verify-live` would gate
    // nothing. Failing one is a different matter — see below.
    notKinds: [K.UAT, K.LIVE_VERIFICATION],
  },
  fail: {
    to: S.FAILED,
    from: [S.IN_PROGRESS],
    permissions: [PERMISSIONS.QA_RECORD_RESULT],
    assigneeOnly: true,
    // Reporting that production is broken is never the restricted direction: whoever notices may
    // say so with the ordinary permission.
    notKinds: [K.UAT],
  },
  clarify: {
    to: S.CLARIFICATION,
    from: [S.IN_PROGRESS],
    permissions: [PERMISSIONS.QA_RECORD_RESULT],
    assigneeOnly: true,
    requiresNote: true,
    notKinds: [K.UAT],
  },
  verifyLive: {
    to: S.PASSED,
    from: [S.IN_PROGRESS],
    permissions: [PERMISSIONS.QA_VERIFY_LIVE],
    // Not assignee-only: the permission is the gate, and a release manager verifying the deploy
    // they watched go out is the normal case.
    onlyKinds: [K.LIVE_VERIFICATION],
  },
  cancel: {
    to: S.CANCELLED,
    from: [S.PENDING, S.IN_PROGRESS, S.CLARIFICATION],
    // Whoever can hand testing out can take it back; the tester cannot cancel their own queue.
    permissions: [PERMISSIONS.QA_ASSIGN],
  },
};

/** What the caller is trying to do it to, and as whom. */
export interface TestingAssignmentActor {
  userId: string;
  permissions: readonly PermissionKey[];
}

export interface TestingAssignmentSubject {
  status: TestingAssignmentStatus;
  kind: TestingAssignmentKind;
  assignedToUserId: string | null;
}

export type TestingAssignmentRefusal =
  | { ok: false; reason: 'state'; message: string }
  | { ok: false; reason: 'permission'; message: string }
  | { ok: false; reason: 'assignee'; message: string }
  | { ok: false; reason: 'kind'; message: string }
  | { ok: false; reason: 'note'; message: string };

export type TestingAssignmentCheck =
  { ok: true; to: TestingAssignmentStatus } | TestingAssignmentRefusal;

/**
 * One place that answers whether an action is allowed, and says specifically why not.
 *
 * The order of the checks is the order the refusals are useful in: state first (nothing else
 * matters on a finished assignment), then kind, then permission, then ownership, then the note.
 */
export function checkTestingAssignmentAction(
  action: TestingAssignmentAction,
  current: TestingAssignmentStatus,
  subject: Omit<TestingAssignmentSubject, 'status'>,
  actor: TestingAssignmentActor,
  note?: string | null,
): TestingAssignmentCheck {
  const rule = TESTING_ASSIGNMENT_ACTIONS[action];

  if (!rule.from.includes(current)) {
    return {
      ok: false,
      reason: 'state',
      message: `A ${current} assignment cannot be ${pastTense(action)}`,
    };
  }
  // The action table and the transition table must agree; a disagreement fails closed.
  if (!canTransitionTestingAssignment(current, rule.to)) {
    return { ok: false, reason: 'state', message: `${current} cannot move to ${rule.to}` };
  }
  if (rule.onlyKinds && !rule.onlyKinds.includes(subject.kind)) {
    return {
      ok: false,
      reason: 'kind',
      message: `Only a ${rule.onlyKinds.join(' or ')} assignment can be ${pastTense(action)}`,
    };
  }
  if (rule.notKinds?.includes(subject.kind)) {
    return { ok: false, reason: 'kind', message: refusalForKind(subject.kind, action) };
  }
  const missing = rule.permissions.filter((permission) => !actor.permissions.includes(permission));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'permission',
      message: `This action needs the ${missing.join(' and ')} permission`,
    };
  }
  if (
    rule.assigneeOnly &&
    subject.assignedToUserId !== null &&
    subject.assignedToUserId !== actor.userId
  ) {
    return { ok: false, reason: 'assignee', message: 'Only the assigned tester can do this' };
  }
  if (rule.requiresNote && !note?.trim()) {
    return { ok: false, reason: 'note', message: 'A question is required for this action' };
  }

  return { ok: true, to: rule.to };
}

/**
 * The same check, as the HTTP error the API should answer with: 409 when the assignment is in the
 * wrong state or of the wrong kind, 403 when the person is wrong, 400 when the request is.
 */
export function assertTestingAssignmentAction(
  action: TestingAssignmentAction,
  current: TestingAssignmentStatus,
  subject: Omit<TestingAssignmentSubject, 'status'>,
  actor: TestingAssignmentActor,
  note?: string | null,
): TestingAssignmentStatus {
  const check = checkTestingAssignmentAction(action, current, subject, actor, note);
  if (check.ok) {
    return check.to;
  }
  if (check.reason === 'permission' || check.reason === 'assignee') {
    throw new ForbiddenException(check.message);
  }
  if (check.reason === 'note') {
    throw new BadRequestException(check.message);
  }
  throw new ConflictException(check.message);
}

/** A failed result the tester marked for retest is work still owed, not work finished. */
export function needsRetest(status: TestingAssignmentStatus, retestRequired: boolean): boolean {
  return status === S.FAILED && retestRequired;
}

function refusalForKind(kind: TestingAssignmentKind, action: TestingAssignmentAction): string {
  if (kind === K.UAT) {
    // UAT is the client's decision, recorded against a uat_request in the portal. Letting an
    // internal tester pass it here would put staff words behind a client sign-off.
    return 'A UAT assignment is decided by the client, not recorded here';
  }
  if (kind === K.LIVE_VERIFICATION && action === 'pass') {
    return 'Use verify-live to sign off a live verification';
  }
  return `A ${kind} assignment cannot be ${pastTense(action)}`;
}

/** Only for refusal messages, so "cannot be verifyLived" never reaches a user. */
function pastTense(action: TestingAssignmentAction): string {
  const words: Record<TestingAssignmentAction, string> = {
    start: 'started',
    pass: 'passed',
    fail: 'failed',
    clarify: 'sent back for clarification',
    verifyLive: 'verified live',
    cancel: 'cancelled',
  };
  return words[action];
}
