import { fromLocal, parseClock, toLocal } from '../sla-escalations/business-hours';

/** Identical notifications (same dedupe key) are dropped inside this window. */
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Unread notifications with the same group key are merged inside this window. */
export const GROUP_WINDOW_MS = 30 * 60 * 1000;
/** More than this many notifications per minute for one person are deferred, not dropped. */
export const RATE_LIMIT_PER_MINUTE = 20;
export const RATE_LIMIT_DEFER_MS = 60 * 1000;

export interface QuietHours {
  quietHoursEnabled: boolean;
  /** "22:00" */
  quietHoursStart: string;
  /** "07:00" */
  quietHoursEnd: string;
  timezone: string;
}

/**
 * When quiet hours are on and `now` falls inside them, the instant they end (delivery is
 * deferred until then); otherwise null. Windows may cross midnight (22:00 → 07:00).
 */
export function quietHoursDeferral(now: Date, settings: QuietHours): Date | null {
  if (!settings.quietHoursEnabled) {
    return null;
  }
  const start = parseClock(settings.quietHoursStart);
  const end = parseClock(settings.quietHoursEnd);
  if (start === end) {
    return null;
  }
  const local = toLocal(now, settings.timezone);
  const minute = local.minuteOfDay;
  const crossesMidnight = start > end;
  const inside = crossesMidnight
    ? minute >= start || minute < end
    : minute >= start && minute < end;
  if (!inside) {
    return null;
  }
  const endsToday = crossesMidnight ? minute < end : true;
  const day = endsToday ? local.day : local.day + 1;
  return fromLocal(settings.timezone, local.year, local.month, day, end);
}

/** Default channel state when a person has not saved a preference. */
export function defaultChannelEnabled(channel: string): boolean {
  return channel === 'IN_APP';
}
