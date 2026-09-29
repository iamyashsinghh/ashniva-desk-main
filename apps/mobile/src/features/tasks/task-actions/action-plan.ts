import { TASK_ACTION, type TaskActionAvailability } from '@ashniva/types';

import type { IconName } from '../../../shared/components/Icon';
import { actionState } from '../task-display';

/**
 * What the action area draws, from the API's `task.actions`.
 *
 * Approve and reject are one entry, "Review", because they are one decision taken in one sheet.
 * "Send to testing" is not a task action — it creates a QA assignment — so whether to offer it is
 * passed in from the caller's `qa:assign` permission.
 */
export type ActionKey =
  | typeof TASK_ACTION.START
  | typeof TASK_ACTION.SUBMIT
  | typeof TASK_ACTION.UNBLOCK
  | typeof TASK_ACTION.LOG_WORK
  | typeof TASK_ACTION.EDIT
  | typeof TASK_ACTION.ASSIGN
  | typeof TASK_ACTION.BLOCK
  | typeof TASK_ACTION.REOPEN
  | typeof TASK_ACTION.CANCEL
  | 'review'
  | 'send-to-testing';

export interface PlannedAction {
  key: ActionKey;
  label: string;
  icon: IconName;
  enabled: boolean;
  reason: string | null;
  destructive: boolean;
}

const COPY: Record<ActionKey, { label: string; icon: IconName; destructive?: boolean }> = {
  start: { label: 'Start work', icon: 'play' },
  submit: { label: 'Send for review', icon: 'paper-plane-outline' },
  review: { label: 'Review', icon: 'checkmark-done-outline' },
  unblock: { label: 'Unblock', icon: 'lock-open-outline' },
  'log-work': { label: 'Log time', icon: 'time-outline' },
  edit: { label: 'Edit task', icon: 'create-outline' },
  assign: { label: 'Assign / reassign', icon: 'person-add-outline' },
  'send-to-testing': { label: 'Send to testing', icon: 'flask-outline' },
  block: { label: 'Mark as blocked', icon: 'hand-left-outline' },
  reopen: { label: 'Reopen', icon: 'refresh-outline' },
  cancel: { label: 'Cancel task', icon: 'close-circle-outline', destructive: true },
};

/** The order the web app lists them in; the first offered of the first four is the primary. */
const ORDER: readonly ActionKey[] = [
  TASK_ACTION.START,
  TASK_ACTION.SUBMIT,
  'review',
  TASK_ACTION.UNBLOCK,
  TASK_ACTION.LOG_WORK,
  TASK_ACTION.EDIT,
  TASK_ACTION.ASSIGN,
  'send-to-testing',
  TASK_ACTION.BLOCK,
  TASK_ACTION.REOPEN,
  TASK_ACTION.CANCEL,
];

const PRIMARY_CANDIDATES: readonly ActionKey[] = ORDER.slice(0, 4);

function stateOf(
  actions: readonly TaskActionAvailability[],
  key: ActionKey,
  extra: { canEdit: boolean; canSendToTesting: boolean },
): { offered: boolean; enabled: boolean; reason: string | null } {
  if (key === 'send-to-testing') {
    return { offered: extra.canSendToTesting, enabled: true, reason: null };
  }
  if (key === 'review') {
    const approve = actionState(actions, TASK_ACTION.APPROVE);
    const reject = actionState(actions, TASK_ACTION.REJECT);
    const offered = approve.offered || reject.offered;
    return { offered, enabled: offered, reason: null };
  }
  if (key === TASK_ACTION.EDIT && !extra.canEdit) {
    return { offered: false, enabled: false, reason: null };
  }
  // Start alone keeps its refusal on screen: "scheduled to start later" is about the task, where
  // every other refusal is about the person and a greyed button saying so is noise.
  return actionState(actions, key, {
    showReasonWhenDisabled: key === TASK_ACTION.START,
  });
}

export function planTaskActions(
  actions: readonly TaskActionAvailability[],
  extra: { canEdit: boolean; canSendToTesting: boolean },
): { primary: PlannedAction | null; others: PlannedAction[] } {
  const offered = ORDER.flatMap((key): PlannedAction[] => {
    const state = stateOf(actions, key, extra);
    if (!state.offered) {
      return [];
    }
    const copy = COPY[key];
    return [
      {
        key,
        label: copy.label,
        icon: copy.icon,
        enabled: state.enabled,
        reason: state.reason,
        destructive: copy.destructive ?? false,
      },
    ];
  });
  const candidates = offered.filter((entry) => PRIMARY_CANDIDATES.includes(entry.key));
  const primary = candidates.find((entry) => entry.enabled) ?? candidates[0] ?? null;
  return { primary, others: offered.filter((entry) => entry !== primary) };
}
