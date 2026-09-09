import { TASK_STATUS_TONES } from '@ashniva/ui/status-tone';
import {
  TASK_TIMING,
  TASK_TIMING_LABELS,
  type TaskAction,
  type TaskActionAvailability,
  type TaskStatus,
  type TaskTimingResult,
} from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';

/**
 * Status colour, from the same table the web app uses.
 *
 * The shared table has two tones the native pill does not implement — `review` reads as info on a
 * small screen, where a distinct sixth colour is noise rather than signal. Mapping here rather
 * than adding a tone keeps the two apps agreeing about which statuses are worrying.
 */
export function taskTone(status: TaskStatus): PillTone {
  const tone = TASK_STATUS_TONES[status];
  return tone === 'review' ? 'info' : tone;
}

const TIMING_TONES: Record<string, PillTone> = {
  [TASK_TIMING.ON_TIME]: 'success',
  [TASK_TIMING.IN_HAND]: 'neutral',
  [TASK_TIMING.AT_RISK]: 'warning',
  [TASK_TIMING.DELAYED]: 'danger',
};

/**
 * The on-time verdict as a pill, or null when there is nothing to say.
 *
 * The verdict itself is **not** computed here. It arrives on the task, decided by
 * `computeTaskTiming` on the server, so this screen and the web app cannot disagree about whether
 * a task is late — which is the whole reason it is derived there rather than on each device. This
 * only chooses a colour and a word.
 *
 * `UNSCHEDULED` returns null rather than a grey pill, matching the web badge: a task nobody gave a
 * deadline to has no result, and a neutral chip in the row reads as one.
 *
 * The label is the shared `TASK_TIMING_LABELS`, not a native rewording, and it carries no
 * duration — the row has no space for one and the detail screen already prints the due time. It is
 * a fact about this task and nothing else: nothing here counts how often anybody was late.
 */
export function timingPill(timing: TaskTimingResult): { label: string; tone: PillTone } | null {
  if (timing.status === TASK_TIMING.UNSCHEDULED) {
    return null;
  }
  return {
    label: TASK_TIMING_LABELS[timing.status],
    tone: TIMING_TONES[timing.status] ?? 'neutral',
  };
}

/** What the screen knows about one action, once the API's answer has been read. */
export interface ActionState {
  /** Whether to draw a control for it at all. */
  offered: boolean;
  /** Whether the control can be pressed. */
  enabled: boolean;
  /** The API's own sentence for why not. Shown as the hint under a disabled control. */
  reason: string | null;
}

const HIDDEN: ActionState = { offered: false, enabled: false, reason: null };

/**
 * What to draw for one action.
 *
 * The API returns an availability for every action with a reason when it is refused, and this
 * decides what to do with it. The choice worth naming is the one about *disabled* controls: a
 * refusal that is about timing is shown greyed with its reason, and a refusal that is about the
 * person is not shown at all.
 *
 * The case that made this necessary: a task scheduled to start tomorrow. Hiding the Start button
 * makes the screen look identical to a task somebody else is assigned, and the person stands
 * there wondering what is wrong with their app. Showing it disabled under "This task is scheduled
 * to start later" answers the question. Either way the API refuses the call — the button is not
 * the control, it is the explanation.
 */
export function actionState(
  actions: readonly TaskActionAvailability[],
  action: TaskAction,
  options: { showReasonWhenDisabled?: boolean } = {},
): ActionState {
  const availability = actions.find((entry) => entry.action === action);
  if (!availability) {
    return HIDDEN;
  }
  if (availability.enabled) {
    return { offered: true, enabled: true, reason: null };
  }
  return options.showReasonWhenDisabled
    ? { offered: true, enabled: false, reason: availability.reason ?? null }
    : HIDDEN;
}
