import {
  PERMISSIONS,
  canTransitionAiSummary,
  isClientFacingSummary,
  type AiSummaryStatus,
  type AiSummaryType,
  type PermissionKey,
} from '@ashniva/types';

/**
 * Who may move a summary where, and from which states.
 *
 * The same two-check arrangement as release notes: `@RequirePermissions` on the route answers
 * "may this person approve at all", and this answers "may this summary be approved right now".
 * Both have to hold, so holding the approve permission cannot skip review by calling the endpoint
 * directly.
 *
 * Publishing carries two permissions rather than one. `ai-summary:approve` says the person is
 * trusted with generated text; `client-update:publish` says they are trusted to send something to
 * a client. Publishing generated text to a client needs both, and neither on its own is enough.
 */

export type AiSummaryAction =
  'submit' | 'approve' | 'requestChanges' | 'publish' | 'cancel' | 'returnToDraft';

interface ActionRule {
  to: AiSummaryStatus;
  from: readonly AiSummaryStatus[];
  /** Every one of these must be held. */
  permissions: readonly PermissionKey[];
  requiresNote?: boolean;
  /** Only meaningful for a summary type whose output may reach a client. */
  clientFacingOnly?: boolean;
}

export const AI_SUMMARY_ACTIONS: Record<AiSummaryAction, ActionRule> = {
  submit: {
    to: 'IN_REVIEW',
    from: ['DRAFT', 'CHANGES_REQUESTED'],
    permissions: [PERMISSIONS.AI_SUMMARY_GENERATE],
  },
  approve: {
    to: 'APPROVED',
    from: ['IN_REVIEW'],
    permissions: [PERMISSIONS.AI_SUMMARY_APPROVE],
  },
  requestChanges: {
    to: 'CHANGES_REQUESTED',
    from: ['IN_REVIEW'],
    permissions: [PERMISSIONS.AI_SUMMARY_APPROVE],
    requiresNote: true,
  },
  publish: {
    to: 'PUBLISHED',
    from: ['APPROVED'],
    permissions: [PERMISSIONS.AI_SUMMARY_APPROVE, PERMISSIONS.CLIENT_UPDATE_PUBLISH],
    clientFacingOnly: true,
  },
  cancel: {
    to: 'CANCELLED',
    // Not from GENERATING: the transition table does not allow it, and cancelling a summary a
    // worker is still writing to would be a race for no gain. Return it to draft first.
    from: ['DRAFT', 'GENERATION_FAILED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'],
    permissions: [PERMISSIONS.AI_SUMMARY_APPROVE],
    requiresNote: true,
  },
  returnToDraft: {
    to: 'DRAFT',
    // Deliberately NOT from GENERATING, though the transition table would permit it.
    //
    // A worker killed between the claim and the result does leave the row stuck there, and an
    // earlier revision of this file added GENERATING here to give it a way out. That fix was
    // worse than the problem: `transition` only changes the status. It does not cancel the queued
    // job, does not close the open `ai_generation_runs` row, and leaves no token the worker could
    // check. So returning a *live* summary to draft lets a second generation be claimed on top of
    // the first — two workers replacing each other's sources and content, and a hand-edit made in
    // between silently overwritten when the first one finishes.
    //
    // GENERATING stays terminal until a run carries a claim token the final write is conditional
    // on. `canStartGeneration` below depends on GENERATING meaning "a worker owns this".
    from: ['CHANGES_REQUESTED', 'APPROVED', 'CANCELLED', 'GENERATION_FAILED'],
    permissions: [PERMISSIONS.AI_SUMMARY_GENERATE],
  },
};

export type WorkflowRefusal =
  | { ok: false; reason: 'state'; message: string }
  | { ok: false; reason: 'permission'; message: string }
  | { ok: false; reason: 'note'; message: string }
  | { ok: false; reason: 'not-client-facing'; message: string };

export type WorkflowCheck = { ok: true; to: AiSummaryStatus } | WorkflowRefusal;

/** One place that answers whether an action is allowed, and says specifically why not. */
export function checkAiSummaryAction(
  action: AiSummaryAction,
  current: AiSummaryStatus,
  type: AiSummaryType,
  permissions: readonly PermissionKey[],
  note?: string | null,
): WorkflowCheck {
  const rule = AI_SUMMARY_ACTIONS[action];

  if (!rule.from.includes(current)) {
    return {
      ok: false,
      reason: 'state',
      message: `A summary that is ${current} cannot be ${action}ed`,
    };
  }
  // The action table and the transition table must agree; a disagreement fails closed.
  if (!canTransitionAiSummary(current, rule.to)) {
    return { ok: false, reason: 'state', message: `${current} cannot move to ${rule.to}` };
  }
  if (rule.clientFacingOnly && !isClientFacingSummary(type)) {
    return {
      ok: false,
      reason: 'not-client-facing',
      message: `A ${type} summary is internal and cannot be published to a client`,
    };
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
 * A published summary is frozen: a client has read it, and changing the text afterwards would
 * change what they were told with no trace. An approved one is frozen too — editing after
 * approval would make the approval meaningless.
 */
export function isSummaryEditable(status: AiSummaryStatus): boolean {
  return status === 'DRAFT' || status === 'CHANGES_REQUESTED' || status === 'GENERATION_FAILED';
}

/**
 * Regeneration is allowed wherever editing is.
 *
 * It never overwrites approved history: the previous text is written to `ai_summary_versions`
 * first, and an approved or published summary cannot be regenerated at all.
 */
export function isRegenerable(status: AiSummaryStatus): boolean {
  return isSummaryEditable(status);
}

/** A run may only start when nothing else is running for this summary. */
export function canStartGeneration(status: AiSummaryStatus): boolean {
  return status !== 'GENERATING' && isRegenerable(status);
}
