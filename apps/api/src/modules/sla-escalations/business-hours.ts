/**
 * Business-hour arithmetic for SLA clocks. Everything is computed in the policy's timezone with
 * the Intl API, so no date library is needed and DST is handled by the platform.
 */
export interface BusinessCalendar {
  timezone: string;
  /** "HH:MM"; "24:00" is allowed as an end time. */
  businessHoursStart: string;
  businessHoursEnd: string;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  businessDays: readonly number[];
}

interface LocalTime {
  year: number;
  month: number;
  day: number;
  minuteOfDay: number;
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const MINUTE_MS = 60_000;
/** Upper bound on days walked by the loops below; guards against calendars with no hours. */
const MAX_DAYS = 800;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timezone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(timezone, cached);
  }
  return cached;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    formatter(timezone);
    return true;
  } catch {
    return false;
  }
}

/** "09:30" → 570. "24:00" → 1440. */
export function parseClock(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function toLocal(instant: Date, timezone: string): LocalTime {
  const parts: Record<string, string> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? 'Mon'] ?? 1,
  };
}

/** Local wall-clock time in the timezone → instant. Day and minute may overflow (handled by Date.UTC). */
export function fromLocal(
  timezone: string,
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
): Date {
  const guess = Date.UTC(year, month - 1, day, 0, minuteOfDay);
  const offsetAt = (instant: number) => {
    const local = toLocal(new Date(instant), timezone);
    return Date.UTC(local.year, local.month - 1, local.day, 0, local.minuteOfDay) - instant;
  };
  let result = guess - offsetAt(guess);
  const secondOffset = offsetAt(result);
  if (guess - secondOffset !== result) {
    result = guess - secondOffset;
  }
  return new Date(result);
}

function isAlwaysOpen(calendar: BusinessCalendar): boolean {
  return (
    parseClock(calendar.businessHoursStart) === 0 &&
    parseClock(calendar.businessHoursEnd) === 1440 &&
    calendar.businessDays.length === 7
  );
}

/** The instant reached after `minutes` business minutes from `from`. */
export function addBusinessMinutes(from: Date, minutes: number, calendar: BusinessCalendar): Date {
  if (minutes <= 0) {
    return from;
  }
  if (isAlwaysOpen(calendar)) {
    return new Date(from.getTime() + minutes * MINUTE_MS);
  }
  const start = parseClock(calendar.businessHoursStart);
  const end = parseClock(calendar.businessHoursEnd);
  const { timezone } = calendar;
  let remaining = minutes;
  let cursor = from;
  for (let step = 0; step < MAX_DAYS; step += 1) {
    const local = toLocal(cursor, timezone);
    if (calendar.businessDays.includes(local.weekday) && local.minuteOfDay < end) {
      const startAt = Math.max(local.minuteOfDay, start);
      const available = end - startAt;
      if (remaining <= available) {
        return fromLocal(timezone, local.year, local.month, local.day, startAt + remaining);
      }
      remaining -= available;
    }
    cursor = fromLocal(timezone, local.year, local.month, local.day + 1, start);
  }
  // A calendar without any business hours: fall back to wall-clock minutes rather than hang.
  return new Date(from.getTime() + minutes * MINUTE_MS);
}

/** Business minutes elapsed between two instants (0 when `to` is not after `from`). */
export function businessMinutesBetween(from: Date, to: Date, calendar: BusinessCalendar): number {
  if (to.getTime() <= from.getTime()) {
    return 0;
  }
  if (isAlwaysOpen(calendar)) {
    return Math.round((to.getTime() - from.getTime()) / MINUTE_MS);
  }
  const start = parseClock(calendar.businessHoursStart);
  const end = parseClock(calendar.businessHoursEnd);
  const { timezone } = calendar;
  let total = 0;
  let cursor = from;
  for (let step = 0; step < MAX_DAYS; step += 1) {
    const local = toLocal(cursor, timezone);
    if (calendar.businessDays.includes(local.weekday)) {
      const dayStart = fromLocal(timezone, local.year, local.month, local.day, start).getTime();
      const dayEnd = fromLocal(timezone, local.year, local.month, local.day, end).getTime();
      const windowStart = Math.max(cursor.getTime(), dayStart);
      const windowEnd = Math.min(to.getTime(), dayEnd);
      if (windowEnd > windowStart) {
        total += (windowEnd - windowStart) / MINUTE_MS;
      }
    }
    const next = fromLocal(timezone, local.year, local.month, local.day + 1, 0);
    if (next.getTime() >= to.getTime()) {
      break;
    }
    cursor = next;
  }
  return Math.round(total);
}
