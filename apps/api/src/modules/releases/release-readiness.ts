import {
  PERMISSIONS,
  RELEASE_APPROVAL_DECISION,
  UAT_DECISION,
  type PermissionKey,
  type ProjectReleasePolicySummary,
  type ReleaseApprovalDecision,
  type ReleaseApproverRole,
  type ReleaseGate,
  type ReleaseReadiness,
  type ReleaseStatus,
  type UatDecision,
} from '@ashniva/types';

import { checkReleaseAction } from './release-workflow';

/**
 * Whether a release may go out, and — either way — why.
 *
 * Computed here and sent whole on `ReleaseDetail`, never re-derived in the browser. A UI that
 * decides for itself whether a release is publishable is a UI that can be wrong in a way nobody
 * notices until production, and the same arithmetic done twice drifts.
 *
 * Every gate carries a `reason` whether it passes or not, so a disabled Publish button can say
 * "waiting on the QA lead" instead of merely being grey.
 *
 * A pure function over already-fetched counts: the gathering lives in the repository, so this can
 * be read, reasoned about and tested without a database.
 */

export interface ApprovalState {
  approverRole: ReleaseApproverRole;
  decision: ReleaseApprovalDecision;
}

export interface QaState {
  /** Non-cancelled QA and retest assignments covering the release or any of its items. */
  total: number;
  passed: number;
  failed: number;
}

export interface UatState {
  total: number;
  approved: number;
  /** A client who asked for changes blocks the release just as firmly as one who has not looked. */
  changesRequested: number;
}

/** One UAT request as the gate reads it: which subject it is about, and how it was answered. */
export interface UatRequestState {
  releaseId: string | null;
  taskId: string | null;
  status: UatDecision;
}

/**
 * The current sign-off per subject, and nothing older.
 *
 * A client's "request changes" is not a verdict on the project for ever; it is a verdict on the
 * ask it answered. The provider makes the change and asks again — and until this counted only the
 * newest ask per subject, that second request could not help: the first row still existed, still
 * said CHANGES_REQUESTED, and the UAT gate reads `changesRequested > 0`. On a project with
 * `requiresClientUat` the first "request changes" therefore made the release permanently
 * unpublishable, whatever anybody did afterwards.
 *
 * Newest-per-subject rather than a `supersededAt` column written by `POST /uat`, deliberately:
 * "which ask is current" is derivable from the rows themselves, so it cannot drift from them, it
 * needs no migration and no backfill, and it unsticks releases already blocked in a live database.
 * Nothing is hidden either — the superseded request keeps its row, its note and its thread, and
 * still appears in the list and the audit trail. It simply stops being the question on the table.
 *
 * `rows` must be ordered newest first; the first row seen for a subject is the current one.
 */
export function currentUatState(rows: readonly UatRequestState[]): UatState {
  const current = new Map<string, UatDecision>();
  for (const row of rows) {
    // Exactly one of the two is set — `UatService.clientOf` refuses anything else — so the pair
    // names the subject. A row with neither is data nobody can act on, and is left out.
    const subject = row.releaseId ? `release:${row.releaseId}` : `task:${row.taskId ?? ''}`;
    if (row.releaseId === null && row.taskId === null) {
      continue;
    }
    if (!current.has(subject)) {
      current.set(subject, row.status);
    }
  }
  const statuses = [...current.values()];
  return {
    total: statuses.length,
    approved: statuses.filter((status) => status === UAT_DECISION.APPROVED).length,
    changesRequested: statuses.filter((status) => status === UAT_DECISION.CHANGES_REQUESTED).length,
  };
}

export interface ReadinessInput {
  status: ReleaseStatus;
  itemCount: number;
  policy: ProjectReleasePolicySummary;
  /** Snapshotted at request-approval time; empty until then. */
  approvals: readonly ApprovalState[];
  qa: QaState;
  uat: UatState;
  permissions: readonly PermissionKey[];
}

export function computeReleaseReadiness(input: ReadinessInput): ReleaseReadiness {
  const gates: ReleaseGate[] = [
    itemsGate(input),
    approvalsGate(input),
    qaGate(input),
    uatGate(input),
    publisherGate(input),
  ];
  const allSatisfied = gates.every((gate) => gate.satisfied);
  // The gates say the release *should* go out; the state machine says it *can*. Publishing a
  // release that is still in DRAFT would satisfy every gate above and still be wrong.
  const stateAllows = checkReleaseAction('publish', input.status, input.permissions).ok;

  return {
    publishable: allSatisfied && stateAllows,
    requiresTypedConfirmation: input.policy.requiresTypedConfirmation,
    gates,
  };
}

function itemsGate({ itemCount }: ReadinessInput): ReleaseGate {
  return {
    key: 'items',
    satisfied: itemCount > 0,
    reason:
      itemCount > 0
        ? `${itemCount} item${itemCount === 1 ? '' : 's'} included`
        : 'A release with nothing in it has nothing to publish',
  };
}

/**
 * Approvals are read from the snapshot rows, not from the policy as it stands now.
 *
 * The rows were created from the policy when approval was requested, so editing the policy
 * afterwards cannot add a signature to a release already in flight (which would silently unblock
 * nothing but confuse everyone) or remove one that has already been given.
 */
function approvalsGate({ policy, approvals }: ReadinessInput): ReleaseGate {
  if (approvals.length === 0) {
    if (policy.approverRoles.length === 0) {
      return { key: 'approvals', satisfied: true, reason: 'This project requires no sign-off' };
    }
    return {
      key: 'approvals',
      satisfied: false,
      reason: 'Approval has not been requested yet',
    };
  }

  const rejected = approvals.filter(
    (row) => row.decision === RELEASE_APPROVAL_DECISION.REJECTED,
  ).length;
  if (rejected > 0) {
    return {
      key: 'approvals',
      satisfied: false,
      reason: `${rejected} approver${rejected === 1 ? ' has' : 's have'} rejected this release`,
    };
  }

  const waiting = approvals.filter((row) => row.decision !== RELEASE_APPROVAL_DECISION.APPROVED);
  if (waiting.length > 0) {
    return {
      key: 'approvals',
      satisfied: false,
      reason: `Waiting on ${waiting.map((row) => label(row.approverRole)).join(', ')}`,
    };
  }

  return {
    key: 'approvals',
    satisfied: true,
    reason: `All ${approvals.length} sign-off${approvals.length === 1 ? '' : 's'} given`,
  };
}

/**
 * A project that insists on a QA pass is not satisfied by the absence of QA.
 *
 * Counting zero assignments as "nothing failed, therefore fine" is how an untested release gets
 * out: the gate would be green on exactly the release nobody looked at. So the flag means both
 * "every assignment passed" and "there was at least one".
 */
function qaGate({ policy, qa }: ReadinessInput): ReleaseGate {
  if (!policy.requiresQaPass) {
    return { key: 'qa', satisfied: true, reason: 'This project does not gate on QA' };
  }
  if (qa.failed > 0) {
    return {
      key: 'qa',
      satisfied: false,
      reason: `${qa.failed} QA check${qa.failed === 1 ? '' : 's'} failed`,
    };
  }
  if (qa.total === 0) {
    return { key: 'qa', satisfied: false, reason: 'No QA has been recorded for this release' };
  }
  if (qa.passed < qa.total) {
    return {
      key: 'qa',
      satisfied: false,
      reason: `${qa.total - qa.passed} of ${qa.total} QA checks are still open`,
    };
  }
  return { key: 'qa', satisfied: true, reason: `All ${qa.total} QA checks passed` };
}

function uatGate({ policy, uat }: ReadinessInput): ReleaseGate {
  if (!policy.requiresClientUat) {
    return { key: 'uat', satisfied: true, reason: 'This project does not gate on client UAT' };
  }
  if (uat.changesRequested > 0) {
    return { key: 'uat', satisfied: false, reason: 'The client has asked for changes' };
  }
  if (uat.total === 0) {
    return { key: 'uat', satisfied: false, reason: 'The client has not been asked to sign off' };
  }
  if (uat.approved < uat.total) {
    return { key: 'uat', satisfied: false, reason: 'Waiting on the client’s sign-off' };
  }
  return { key: 'uat', satisfied: true, reason: 'The client has signed off' };
}

/**
 * The route guard already requires `release:publish`, so this gate is not what keeps an
 * unauthorised person out. It exists so the person reading the checklist — a manager who may
 * approve but not publish — is told which button is not theirs, rather than seeing a green
 * checklist and a Publish that 403s.
 */
function publisherGate({ permissions }: ReadinessInput): ReleaseGate {
  const allowed = permissions.includes(PERMISSIONS.RELEASE_PUBLISH);
  return {
    key: 'publisher',
    satisfied: allowed,
    reason: allowed
      ? 'You may publish releases'
      : 'Publishing needs the release:publish permission',
  };
}

const APPROVER_LABEL: Record<ReleaseApproverRole, string> = {
  SENIOR: 'a senior',
  PROJECT_MANAGER: 'the project manager',
  QA_LEAD: 'the QA lead',
  CLIENT: 'the client',
  DIRECTOR: 'a director',
};

function label(role: ReleaseApproverRole): string {
  return APPROVER_LABEL[role];
}
