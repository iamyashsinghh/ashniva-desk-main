import {
  PERMISSIONS,
  RELEASE_STATUS,
  type PermissionKey,
  type ReleaseStatus,
} from '@ashniva/types';

/**
 * Where a release may go, and who may take it there.
 *
 * Two tables rather than one. `RELEASE_TRANSITIONS` is the shape of the state machine — the
 * question "is PUBLISHED reachable from DRAFT" has one answer and it does not depend on who is
 * asking. `RELEASE_ACTIONS` is what a person may do — the same edge can be walked by one role and
 * not another. Keeping them apart means a new action cannot quietly widen the machine, and the
 * check below fails closed when the two disagree.
 *
 * The permissions here are the second of two checks. `@RequirePermissions` on the route answers
 * "may this person publish at all"; this answers "may *this* release be published, right now".
 * Both have to hold, so holding `release:publish` cannot skip the approvals by calling the
 * endpoint directly.
 *
 * Readiness — approvals collected, QA passed, UAT signed off — is deliberately *not* here. It
 * depends on rows in four other tables, so it lives in `release-readiness.ts` and is checked
 * alongside this one at publish time.
 */

/** Every edge in the machine. Anything not listed is impossible, whoever asks. */
export const RELEASE_TRANSITIONS: Record<ReleaseStatus, readonly ReleaseStatus[]> = {
  DRAFT: [RELEASE_STATUS.APPROVAL_REQUESTED],
  // Back to DRAFT on a rejection: the release is edited and re-submitted, and the rejected
  // signatures are thrown away with it rather than carried into the next attempt.
  APPROVAL_REQUESTED: [RELEASE_STATUS.APPROVED, RELEASE_STATUS.DRAFT],
  // Straight to PUBLISHING without SCHEDULED, because scheduling is optional: a release approved
  // for "now" should not have to be booked for a time that has already passed.
  APPROVED: [RELEASE_STATUS.SCHEDULED, RELEASE_STATUS.PUBLISHING],
  // SCHEDULED → SCHEDULED is a real edge, not an oversight: moving the window is a new time, not
  // a new state, and forcing it through APPROVED would drop the booking in between.
  SCHEDULED: [RELEASE_STATUS.SCHEDULED, RELEASE_STATUS.PUBLISHING],
  // ROLLED_BACK is reachable from PUBLISHING so that a publish which died half way — the process
  // killed between the claim and the result — has an operator-visible way out that records why.
  PUBLISHING: [RELEASE_STATUS.PUBLISHED, RELEASE_STATUS.FAILED, RELEASE_STATUS.ROLLED_BACK],
  PUBLISHED: [RELEASE_STATUS.VERIFIED, RELEASE_STATUS.ROLLED_BACK],
  VERIFIED: [RELEASE_STATUS.ROLLED_BACK],
  // Terminal. A version that was pulled is history; shipping it again is a new release with a new
  // version, so that the two attempts stay separately auditable.
  ROLLED_BACK: [],
  // A failed publish goes back to DRAFT to be fixed and retried. The approvals are re-collected,
  // because the thing being approved has changed.
  FAILED: [RELEASE_STATUS.DRAFT],
};

export function canTransitionRelease(from: ReleaseStatus, to: ReleaseStatus): boolean {
  return RELEASE_TRANSITIONS[from].includes(to);
}

export type ReleaseAction =
  | 'requestApproval'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'publish'
  | 'completePublish'
  | 'failPublish'
  | 'verifyLive'
  | 'rollback'
  | 'reopen';

interface ActionRule {
  /** The state the release moves to. */
  to: ReleaseStatus;
  /** States the action is allowed from. */
  from: readonly ReleaseStatus[];
  /** Every one of these must be held. */
  permissions: readonly PermissionKey[];
  /** Whether the action must carry a reason. */
  requiresNote?: boolean;
}

export const RELEASE_ACTIONS: Record<ReleaseAction, ActionRule> = {
  requestApproval: {
    to: RELEASE_STATUS.APPROVAL_REQUESTED,
    from: [RELEASE_STATUS.DRAFT],
    permissions: [PERMISSIONS.RELEASE_MANAGE],
  },
  approve: {
    to: RELEASE_STATUS.APPROVED,
    from: [RELEASE_STATUS.APPROVAL_REQUESTED],
    permissions: [PERMISSIONS.RELEASE_APPROVE],
  },
  reject: {
    to: RELEASE_STATUS.DRAFT,
    from: [RELEASE_STATUS.APPROVAL_REQUESTED],
    permissions: [PERMISSIONS.RELEASE_APPROVE],
    // A signature withheld without a reason tells the next person nothing.
    requiresNote: true,
  },
  schedule: {
    to: RELEASE_STATUS.SCHEDULED,
    from: [RELEASE_STATUS.APPROVED, RELEASE_STATUS.SCHEDULED],
    permissions: [PERMISSIONS.RELEASE_MANAGE],
  },
  publish: {
    // Claims the release rather than finishing it: PUBLISHING is the lock that stops two
    // operators pressing Publish on the same version. `completePublish` closes it.
    to: RELEASE_STATUS.PUBLISHING,
    from: [RELEASE_STATUS.APPROVED, RELEASE_STATUS.SCHEDULED],
    permissions: [PERMISSIONS.RELEASE_PUBLISH],
  },
  completePublish: {
    to: RELEASE_STATUS.PUBLISHED,
    from: [RELEASE_STATUS.PUBLISHING],
    permissions: [PERMISSIONS.RELEASE_PUBLISH],
  },
  failPublish: {
    to: RELEASE_STATUS.FAILED,
    from: [RELEASE_STATUS.PUBLISHING],
    permissions: [PERMISSIONS.RELEASE_PUBLISH],
    requiresNote: true,
  },
  verifyLive: {
    to: RELEASE_STATUS.VERIFIED,
    from: [RELEASE_STATUS.PUBLISHED],
    permissions: [PERMISSIONS.RELEASE_MANAGE],
  },
  rollback: {
    to: RELEASE_STATUS.ROLLED_BACK,
    from: [RELEASE_STATUS.PUBLISHING, RELEASE_STATUS.PUBLISHED, RELEASE_STATUS.VERIFIED],
    permissions: [PERMISSIONS.RELEASE_PUBLISH],
    // An unexplained rollback is the one nobody learns from.
    requiresNote: true,
  },
  reopen: {
    to: RELEASE_STATUS.DRAFT,
    from: [RELEASE_STATUS.FAILED],
    permissions: [PERMISSIONS.RELEASE_MANAGE],
    // Reopening discards every signature the release had collected, because what the approvers
    // looked at is about to change. That is at least as consequential as a rejection, and both of
    // those already have to say why — so this does too.
    requiresNote: true,
  },
};

export type ReleaseRefusal =
  | { ok: false; reason: 'state'; message: string }
  | { ok: false; reason: 'permission'; message: string }
  | { ok: false; reason: 'note'; message: string };

export type ReleaseCheck = { ok: true; to: ReleaseStatus } | ReleaseRefusal;

/** Reads properly in a refusal: "A release that is PUBLISHED cannot be scheduled". */
const ACTION_VERB: Record<ReleaseAction, string> = {
  requestApproval: 'sent for approval',
  approve: 'approved',
  reject: 'rejected',
  schedule: 'scheduled',
  publish: 'published',
  completePublish: 'finished publishing',
  failPublish: 'marked as failed',
  verifyLive: 'verified live',
  rollback: 'rolled back',
  reopen: 'reopened',
};

/**
 * One place that answers whether an action is allowed, and says specifically why not.
 *
 * The message names the actual obstacle — the state it is in, the permission that is missing —
 * because "you cannot do that" sends the operator to a colleague and a specific refusal does not.
 */
export function checkReleaseAction(
  action: ReleaseAction,
  current: ReleaseStatus,
  permissions: readonly PermissionKey[],
  note?: string | null,
): ReleaseCheck {
  const rule = RELEASE_ACTIONS[action];

  if (!rule.from.includes(current)) {
    return {
      ok: false,
      reason: 'state',
      message: `A release that is ${current} cannot be ${ACTION_VERB[action]}`,
    };
  }
  // The action table and the transition table must agree; a disagreement fails closed.
  if (!canTransitionRelease(current, rule.to)) {
    return { ok: false, reason: 'state', message: `${current} cannot move to ${rule.to}` };
  }
  const missing = rule.permissions.filter((permission) => !permissions.includes(permission));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: 'permission',
      message: `This action needs the ${missing.join(' and ')} permission`,
    };
  }
  if (rule.requiresNote && !note?.trim()) {
    return { ok: false, reason: 'note', message: 'A reason is required for this action' };
  }

  return { ok: true, to: rule.to };
}

/**
 * Title, notes and the target environment stay editable while the release is still being planned.
 * From PUBLISHING onwards the row describes something that happened, and rewriting it would
 * change the record of what went out.
 */
export function isReleaseEditable(status: ReleaseStatus): boolean {
  return (
    status === RELEASE_STATUS.DRAFT ||
    status === RELEASE_STATUS.APPROVAL_REQUESTED ||
    status === RELEASE_STATUS.APPROVED ||
    status === RELEASE_STATUS.SCHEDULED
  );
}

/**
 * Contents may only change in DRAFT.
 *
 * Adding a task after the sign-offs were collected would mean shipping something nobody approved,
 * and the approval rows carry no record of what they covered. Editing a release under review
 * therefore means rejecting it back to DRAFT first.
 */
export function mayChangeItems(status: ReleaseStatus): boolean {
  return status === RELEASE_STATUS.DRAFT;
}

/**
 * The version is fixed once approval is requested. It is what the approvers signed off, what the
 * operator has to type back at publish time, and what the client will be told shipped — a version
 * that can be edited under any of those is not a confirmation of anything.
 */
export function mayChangeVersion(status: ReleaseStatus): boolean {
  return status === RELEASE_STATUS.DRAFT;
}

/**
 * The one state with no way out. VERIFIED is not terminal — a release can still be pulled after
 * it was verified — and FAILED is not either, because a failed publish is meant to be retried.
 */
export function isReleaseTerminal(status: ReleaseStatus): boolean {
  return RELEASE_TRANSITIONS[status].length === 0;
}
