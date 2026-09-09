import { TASK_TIMING, TASK_TIMING_LABELS, type TaskTimingResult } from '@ashniva/types';
import { Badge, type Tone } from '@ashniva/ui';

/**
 * Whether a task met its expected completion, in the server's own verdict.
 *
 * The badge never computes anything: `timing` arrives on the task and is derived there from the
 * timestamps, so the colour on screen and the answer a report gives cannot drift apart.
 *
 * Green, amber, red is the whole vocabulary. A task with no expected completion gets no badge at
 * all rather than a neutral one — an absent deadline is not a result, and a grey chip in the row
 * would read as one.
 */
const TONES: Record<string, Tone> = {
  [TASK_TIMING.ON_TIME]: 'success',
  [TASK_TIMING.IN_HAND]: 'neutral',
  [TASK_TIMING.AT_RISK]: 'warning',
  [TASK_TIMING.DELAYED]: 'danger',
};

/** "2h 15m late" reads faster than "135 minutes late" at a glance down a list. */
export function formatMinutes(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const days = Math.floor(whole / (60 * 24));
  const hours = Math.floor((whole % (60 * 24)) / 60);
  const mins = whole % 60;
  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

export interface TaskTimingBadgeProps {
  timing: TaskTimingResult;
  /**
   * The verdict without its duration, for somewhere the duration is already on screen.
   *
   * The board card is the case: its meta row already says "2 days late" in words next to the due
   * date, so a badge repeating the same number beside it is noise. What the badge is there for on
   * a card is the colour and the one-word answer. A variant here rather than a second badge, so
   * the tone table and the "no badge without a deadline" rule stay in one place.
   */
  compact?: boolean;
}

export function TaskTimingBadge({ timing, compact = false }: TaskTimingBadgeProps) {
  if (timing.status === TASK_TIMING.UNSCHEDULED) {
    return null;
  }
  const tone = TONES[timing.status] ?? 'neutral';
  const label = TASK_TIMING_LABELS[timing.status];
  if (compact) {
    return <Badge tone={tone}>{label}</Badge>;
  }

  if (timing.status === TASK_TIMING.DELAYED && timing.delayMinutes !== null) {
    return <Badge tone={tone}>{`${formatMinutes(timing.delayMinutes)} late`}</Badge>;
  }
  if (timing.status === TASK_TIMING.AT_RISK && timing.minutesUntilDue !== null) {
    return <Badge tone={tone}>{`Due in ${formatMinutes(timing.minutesUntilDue)}`}</Badge>;
  }
  return <Badge tone={tone}>{label}</Badge>;
}

/**
 * Planned against actual effort, as a sentence rather than a badge.
 *
 * Kept separate from the timing badge on purpose: effort and lateness are different questions, and
 * a task can be on time having taken three times the estimate. Showing one number for both would
 * hide whichever of them mattered.
 */
/** Overrun as a phrase. Zero is worth saying out loud — it means the estimate was right. */
function describeOverrun(over: number): string {
  if (over > 0) {
    return `${formatMinutes(over)} over`;
  }
  if (over < 0) {
    return `${formatMinutes(-over)} under`;
  }
  return 'exactly as estimated';
}

export function TaskEffort({ timing }: { timing: TaskTimingResult }) {
  if (timing.estimateMinutes === null) {
    return timing.loggedMinutes > 0 ? (
      <span className="muted">{formatMinutes(timing.loggedMinutes)} logged</span>
    ) : null;
  }
  const comparison = describeOverrun(timing.overrunMinutes ?? 0);
  return (
    <span className="muted">
      {formatMinutes(timing.loggedMinutes)} of {formatMinutes(timing.estimateMinutes)} —{' '}
      {comparison}
    </span>
  );
}
