import type { TaskTimingResult } from '@ashniva/types';

import { Pill } from '../../shared/components/primitives';
import { timingPill } from './task-display';

/**
 * Whether a task met its expected completion, in the server's own verdict.
 *
 * The native counterpart of the web app's `TaskTimingBadge`, and deliberately the same shape: it
 * computes nothing, it renders what `computeTaskTiming` decided on the server, and a task with no
 * expected completion time gets no pill rather than a neutral one. The decision about which of
 * those applies lives in `timingPill`, so the list row and the detail screen cannot disagree.
 *
 * Per-task and nothing more. There is no total, no history and no comparison between people here,
 * and none should be added — see the note at the top of `packages/types/src/workflow/task-timing.ts`.
 */
export function TaskTimingPill({ timing }: { timing: TaskTimingResult }) {
  const pill = timingPill(timing);
  return pill ? <Pill label={pill.label} tone={pill.tone} /> : null;
}
