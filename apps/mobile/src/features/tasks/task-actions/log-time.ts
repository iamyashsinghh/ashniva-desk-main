/** The most one work-log entry may hold: a day. `LogWorkDto` refuses more. */
export const MAX_LOG_MINUTES = 1440;

/**
 * Hours and minutes as typed, into the whole minutes the API takes — or null when they do not
 * make a valid entry. Empty boxes count as zero, so "1" hour and nothing else is 60 minutes.
 */
export function workMinutes(hours: string, minutes: string): number | null {
  const h = hours.trim() === '' ? 0 : Number(hours);
  const m = minutes.trim() === '' ? 0 : Number(minutes);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m >= 60) {
    return null;
  }
  const total = h * 60 + m;
  return total > 0 && total <= MAX_LOG_MINUTES ? total : null;
}
