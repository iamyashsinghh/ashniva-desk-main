import {
  PERMISSIONS,
  canTransitionReleaseNote,
  type PermissionKey,
  type ReleaseNoteStatus,
} from '@ashniva/types';

/**
 * Who may move a release note where, and from which states.
 *
 * Kept as data next to the transition table rather than as `@RequirePermissions` alone, because
 * the guard answers "may this person publish at all" while this answers "may this note be
 * published *right now*". Both have to hold: a publisher must not be able to publish a draft that
 * nobody reviewed by calling the endpoint directly.
 */

export type ReleaseNoteAction =
  'submit' | 'approve' | 'requestChanges' | 'publish' | 'cancel' | 'returnToDraft';

interface ActionRule {
  /** The state the note moves to. */
  to: ReleaseNoteStatus;
  /** States the action is allowed from. */
  from: readonly ReleaseNoteStatus[];
  permission: PermissionKey;
  /** Whether the action must carry a reason. */
  requiresNote?: boolean;
}

export const RELEASE_NOTE_ACTIONS: Record<ReleaseNoteAction, ActionRule> = {
  submit: {
    to: 'IN_REVIEW',
    from: ['DRAFT', 'CHANGES_REQUESTED'],
    permission: PERMISSIONS.RELEASE_NOTE_WRITE,
  },
  approve: {
    to: 'APPROVED',
    from: ['IN_REVIEW'],
    permission: PERMISSIONS.RELEASE_NOTE_APPROVE,
  },
  requestChanges: {
    to: 'CHANGES_REQUESTED',
    from: ['IN_REVIEW'],
    permission: PERMISSIONS.RELEASE_NOTE_APPROVE,
    // Sending work back without saying why wastes the next person's time.
    requiresNote: true,
  },
  publish: {
    // The only action that makes anything visible to a client, so it is the only one that
    // requires its own permission rather than reusing approve.
    to: 'PUBLISHED',
    from: ['APPROVED'],
    permission: PERMISSIONS.RELEASE_NOTE_PUBLISH,
  },
  cancel: {
    to: 'CANCELLED',
    from: ['DRAFT', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'],
    permission: PERMISSIONS.RELEASE_NOTE_APPROVE,
    requiresNote: true,
  },
  returnToDraft: {
    to: 'DRAFT',
    from: ['CHANGES_REQUESTED', 'APPROVED', 'CANCELLED'],
    permission: PERMISSIONS.RELEASE_NOTE_WRITE,
  },
};

export type WorkflowRefusal =
  | { ok: false; reason: 'state'; message: string }
  | { ok: false; reason: 'permission'; message: string }
  | { ok: false; reason: 'note'; message: string };

export type WorkflowCheck = { ok: true; to: ReleaseNoteStatus } | WorkflowRefusal;

/**
 * One place that answers whether an action is allowed, so the service never re-derives the rules
 * and the reason for a refusal is specific enough to show the user.
 */
export function checkReleaseNoteAction(
  action: ReleaseNoteAction,
  current: ReleaseNoteStatus,
  permissions: readonly PermissionKey[],
  note?: string | null,
): WorkflowCheck {
  const rule = RELEASE_NOTE_ACTIONS[action];

  if (!rule.from.includes(current)) {
    return {
      ok: false,
      reason: 'state',
      message: `A release note that is ${current} cannot be ${action}ed`,
    };
  }
  // Belt and braces: the action table and the transition table must agree, and a disagreement
  // should fail closed rather than let an edge through that the state machine does not have.
  if (!canTransitionReleaseNote(current, rule.to)) {
    return {
      ok: false,
      reason: 'state',
      message: `${current} cannot move to ${rule.to}`,
    };
  }
  if (!permissions.includes(rule.permission)) {
    return {
      ok: false,
      reason: 'permission',
      message: `This action needs the ${rule.permission} permission`,
    };
  }
  if (rule.requiresNote && !note?.trim()) {
    return { ok: false, reason: 'note', message: 'A reason is required for this action' };
  }

  return { ok: true, to: rule.to };
}

/**
 * A published note is frozen: editing its body or items after a client has read it would change
 * what they were told without any trace. Cancelled notes are closed for editing too.
 */
export function isEditable(status: ReleaseNoteStatus): boolean {
  return status === 'DRAFT' || status === 'CHANGES_REQUESTED';
}

/** Regeneration only makes sense while the note is still being written. */
export function isRegenerable(status: ReleaseNoteStatus): boolean {
  return isEditable(status);
}
