/**
 * When somebody is expected to work, and whether they actually are.
 *
 * These are two different facts and the model keeps them apart on purpose:
 *
 * - **Configured schedule** (`UserWorkSchedule`) is a rota — Monday to Friday, 09:30 to 18:30,
 *   Asia/Kolkata. It is stable, it is set by a manager, and it answers "should this person be
 *   working now?".
 * - **Actual availability** (`UserAvailability`) is a live fact — logged in, on leave, at their
 *   workload limit. It changes through the day, usually from outside Desk, and answers "is this
 *   person available now?".
 * - **On-call** (`OnCallSchedule`) is neither: it is exceptional cover for a specific date, and it
 *   is the reason somebody outside their normal hours may still be the right person to route to.
 *
 * Collapsing any two of them would lose the distinction the router needs. Somebody can be inside
 * their hours and on leave; outside their hours and on call; available and at their limit. The
 * routing engine (package 8b) reads all three and has to be able to say which one stopped it.
 */

/** Where an availability fact came from. Recorded so a stale one can be recognised as stale. */
export const AVAILABILITY_SOURCE = {
  /** Somebody set it by hand in Desk. */
  MANUAL: 'MANUAL',
  /** Pushed in by Ashniva HR — attendance, login/logout, approved leave. */
  HR: 'HR',
  /** Derived by Desk from the configured schedule, because nothing better is known. */
  SCHEDULE: 'SCHEDULE',
  /** Derived by Desk from how much work the person is already holding. */
  WORKLOAD: 'WORKLOAD',
} as const;

export type AvailabilitySource = (typeof AVAILABILITY_SOURCE)[keyof typeof AVAILABILITY_SOURCE];

/**
 * The states the router cares about.
 *
 * These are exactly the reasons `RoutingDecision.trail` already names — `ON_LEAVE`,
 * `OUT_OF_HOURS`, `AT_WORKLOAD_LIMIT` — so a candidate skipped for one of them can be explained
 * with the same word the audit trail uses, rather than a second vocabulary that has to be mapped.
 */
export const AVAILABILITY_STATUS = {
  AVAILABLE: 'AVAILABLE',
  ON_LEAVE: 'ON_LEAVE',
  OUT_OF_HOURS: 'OUT_OF_HOURS',
  AT_LIMIT: 'AT_LIMIT',
} as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUS)[keyof typeof AVAILABILITY_STATUS];

export const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  AVAILABLE: 'Available',
  ON_LEAVE: 'On leave',
  OUT_OF_HOURS: 'Outside working hours',
  AT_LIMIT: 'At workload limit',
};

/** How on-call cover for a date was decided. */
export const ON_CALL_SOURCE = { MANUAL: 'MANUAL', ROTATION: 'ROTATION' } as const;
export type OnCallSource = (typeof ON_CALL_SOURCE)[keyof typeof ON_CALL_SOURCE];

/**
 * Days of the week as `Date.getUTCDay()` numbers, so no parsing stands between the stored value
 * and the comparison. Sunday is 0, matching JavaScript rather than ISO — the code does the
 * comparing, and the UI does the naming.
 */
export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const DEFAULT_WORKING_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/**
 * A person's normal working week.
 *
 * Times are minutes from midnight in `timezone`, not instants: "09:30 in Asia/Kolkata" stays
 * correct across daylight saving and across the date line, where a stored UTC time would not.
 */
export interface WorkScheduleShape {
  /** `Date.getUTCDay()` numbers. Empty means this person has no working days configured. */
  workingDays: readonly number[];
  /** Minutes from midnight, local to `timezone`. 570 is 09:30. */
  startMinute: number;
  /** Minutes from midnight. May be less than `startMinute` for a shift crossing midnight. */
  endMinute: number;
  /** IANA name, e.g. `Asia/Kolkata`. */
  timezone: string;
}

/** 09:30–18:30 Asia/Kolkata, Monday to Friday: the house default this product is built around. */
export const DEFAULT_WORK_SCHEDULE: WorkScheduleShape = {
  workingDays: DEFAULT_WORKING_DAYS,
  startMinute: 9 * 60 + 30,
  endMinute: 18 * 60 + 30,
  timezone: 'Asia/Kolkata',
};

/** "09:30" from 570, for a form field and for reading back. */
export function minutesToClock(minutes: number): string {
  const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** 570 from "09:30". Returns null rather than guessing at anything that is not a clock time. */
export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

/**
 * The local wall-clock day and minute for an instant, in a given IANA zone.
 *
 * Uses `Intl` rather than arithmetic on the UTC offset because the offset is not a constant: it
 * changes at a daylight-saving boundary, and half the point of storing a timezone name instead of
 * an offset is that the boundary is handled for us.
 */
export function localDayAndMinute(at: Date, timezone: string): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(read('hour'));
  return {
    day: days[read('weekday')] ?? 0,
    // `hour12: false` yields 24 for midnight in some engines; it is minute zero of the same day.
    minute: (hour === 24 ? 0 : hour) * 60 + Number(read('minute')),
  };
}

/**
 * Whether an instant falls inside somebody's configured working week.
 *
 * A shift that ends before it starts is one that runs past midnight — 22:00 to 06:00 — and the
 * hours after midnight belong to the day the shift *started*, which is why the two cases are not
 * the same comparison.
 */
export function isWithinSchedule(schedule: WorkScheduleShape, at: Date): boolean {
  if (schedule.workingDays.length === 0) {
    return false;
  }
  const { day, minute } = localDayAndMinute(at, schedule.timezone);
  const overnight = schedule.endMinute <= schedule.startMinute;

  if (!overnight) {
    return (
      schedule.workingDays.includes(day) &&
      minute >= schedule.startMinute &&
      minute < schedule.endMinute
    );
  }
  // Before midnight: this day must be a working day. After midnight: the previous day must be.
  if (minute >= schedule.startMinute) {
    return schedule.workingDays.includes(day);
  }
  if (minute < schedule.endMinute) {
    return schedule.workingDays.includes((day + 6) % 7);
  }
  return false;
}
