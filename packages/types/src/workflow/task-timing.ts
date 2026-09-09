/**
 * How long a task was supposed to take, how long it actually took, and whether it was late.
 *
 * This is **operational timing, not a performance score**. It compares one task's expected
 * completion with its actual completion and reports the difference. It deliberately does not
 * aggregate across a person, rank anybody, or keep a running total: a task can be late for a dozen
 * reasons that belong in the comments rather than in a number, and a per-task fact stops being a
 * fact the moment it is averaged into a verdict about someone.
 *
 * Computed on read from the timestamps, never stored. A stored verdict is one that can disagree
 * with the dates it came from — a due date moved after the fact would leave the old answer behind.
 */

export const TASK_TIMING = {
  /** Finished at or before the expected time. */
  ON_TIME: 'ON_TIME',
  /** Still open, expected time not yet reached. */
  IN_HAND: 'IN_HAND',
  /** Still open and close enough to the expected time to be worth a glance. */
  AT_RISK: 'AT_RISK',
  /** Finished after the expected time, or still open past it. */
  DELAYED: 'DELAYED',
  /** No expected time was ever set, so lateness is not a question that has an answer. */
  UNSCHEDULED: 'UNSCHEDULED',
} as const;

export type TaskTiming = (typeof TASK_TIMING)[keyof typeof TASK_TIMING];

export const TASK_TIMING_LABELS: Record<TaskTiming, string> = {
  ON_TIME: 'On time',
  IN_HAND: 'In hand',
  AT_RISK: 'Due soon',
  DELAYED: 'Delayed',
  UNSCHEDULED: 'No due time',
};

/**
 * How close to its deadline an open task has to be before it is worth flagging.
 *
 * Two hours rather than a proportion of the estimate: a warning is useful when somebody can still
 * act on it, and that window is set by the working day, not by how long the task was expected to
 * take. A ten-minute task and a three-day task both become urgent at about the same point.
 */
export const AT_RISK_WINDOW_MINUTES = 120;

export interface TaskTimingInput {
  /** When the task is expected to be finished. */
  dueAt: Date | string | null;
  /** When it actually was, if it is finished. */
  completedAt: Date | string | null;
  /** Planned effort, for the estimate-versus-actual comparison. */
  estimateMinutes: number | null;
  /** Effort actually logged against the task. */
  loggedMinutes: number;
  /** Reference point for an open task. Passed in so the answer is reproducible in a test. */
  now?: Date;
}

export interface TaskTimingResult {
  status: TaskTiming;
  /** Minutes late. Positive only when `status` is DELAYED; null when there is nothing to compare. */
  delayMinutes: number | null;
  /** Minutes remaining before the expected time; negative once it has passed. */
  minutesUntilDue: number | null;
  estimateMinutes: number | null;
  loggedMinutes: number;
  /**
   * Logged minus estimated, so a reader can see overrun separately from lateness.
   *
   * They are genuinely different questions: a task can finish on time having taken three times the
   * effort planned, and one that took exactly the estimate can still be late because it was started
   * late. Reporting one number for both would hide whichever mattered.
   */
  overrunMinutes: number | null;
}

function toDate(value: Date | string | null): Date | null {
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const MINUTE = 60_000;

export function computeTaskTiming(input: TaskTimingInput): TaskTimingResult {
  const dueAt = toDate(input.dueAt);
  const completedAt = toDate(input.completedAt);
  const now = input.now ?? new Date();

  const overrunMinutes =
    input.estimateMinutes === null ? null : input.loggedMinutes - input.estimateMinutes;

  const base = {
    estimateMinutes: input.estimateMinutes,
    loggedMinutes: input.loggedMinutes,
    overrunMinutes,
  };

  if (!dueAt) {
    // Effort is still worth reporting on a task nobody gave a deadline to.
    return { ...base, status: TASK_TIMING.UNSCHEDULED, delayMinutes: null, minutesUntilDue: null };
  }

  const reference = completedAt ?? now;
  const diffMinutes = Math.round((reference.getTime() - dueAt.getTime()) / MINUTE);
  // `-diffMinutes` is `-0` when the reference lands exactly on the deadline, and `-0` is not `0`
  // to `Object.is`, to a strict test assertion, or to anything that formats a signed number.
  const remaining = diffMinutes === 0 ? 0 : -diffMinutes;

  if (diffMinutes > 0) {
    return {
      ...base,
      status: TASK_TIMING.DELAYED,
      delayMinutes: diffMinutes,
      minutesUntilDue: -diffMinutes,
    };
  }

  // Finished at or before the deadline. Being early is not a separate verdict — on time is on time.
  if (completedAt) {
    return {
      ...base,
      status: TASK_TIMING.ON_TIME,
      delayMinutes: null,
      minutesUntilDue: remaining,
    };
  }

  return {
    ...base,
    status: remaining <= AT_RISK_WINDOW_MINUTES ? TASK_TIMING.AT_RISK : TASK_TIMING.IN_HAND,
    delayMinutes: null,
    minutesUntilDue: remaining,
  };
}

/** True while a task's scheduled start is still in the future. */
export function isUpcoming(scheduledStartAt: Date | string | null, now = new Date()): boolean {
  const start = toDate(scheduledStartAt);
  return start !== null && start.getTime() > now.getTime();
}
