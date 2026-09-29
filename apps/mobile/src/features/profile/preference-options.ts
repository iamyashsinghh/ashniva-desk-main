import {
  ACTIVE_NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL,
  minutesToClock,
  type NotificationChannel,
  type NotificationPreferenceEntry,
  type NotificationPreferences,
  type NotificationType,
} from '@ashniva/types';

import type { SelectOption } from '../../shared/components/SelectSheet';

/**
 * The choices the notification settings screen offers, and how it reads the stored answers.
 *
 * Only the channels this deployment actually delivers on get switches: a switch for e-mail that
 * changes nothing would be a setting that lies.
 */

export const PREFERENCE_CHANNELS: readonly NotificationChannel[] = ACTIVE_NOTIFICATION_CHANNELS;

export type QuietHours = Pick<
  NotificationPreferences,
  'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd' | 'timezone'
>;

/** What `PUT /notifications/preferences` takes: only what changed. */
export interface PreferencesInput extends Partial<QuietHours> {
  entries?: NotificationPreferenceEntry[];
}

/** A missing entry means "on" for in-app and push — the contract in `NotificationPreferences`. */
export function isChannelEnabled(
  entries: readonly NotificationPreferenceEntry[],
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  const found = entries.find((entry) => entry.type === type && entry.channel === channel);
  if (found) {
    return found.enabled;
  }
  return channel === NOTIFICATION_CHANNEL.IN_APP || channel === NOTIFICATION_CHANNEL.PUSH;
}

export function toggleKey(type: NotificationType, channel: NotificationChannel): string {
  return `${type}:${channel}`;
}

/** Every half hour of the day, "00:00" to "23:30". */
export const HALF_HOUR_TIMES: readonly string[] = Array.from({ length: 48 }, (_, index) =>
  minutesToClock(index * 30),
);

/**
 * The time choices, keeping a saved value that is not on the half hour.
 *
 * The web accepts any minute, so "22:15" set there must still show here rather than reading as
 * unset and being overwritten by the first tap.
 */
export function timeOptions(saved: string): SelectOption[] {
  const times = HALF_HOUR_TIMES.includes(saved)
    ? HALF_HOUR_TIMES
    : [...HALF_HOUR_TIMES, saved].sort();
  return times.map((time) => ({ value: time, label: time }));
}

/** A short list covering where this product's organizations and their clients work. */
export const COMMON_TIMEZONES: readonly string[] = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Dhaka',
  'Asia/Colombo',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Toronto',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'UTC',
];

/** The phone's own zone, when the runtime will say. */
export function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** The common zones, plus the saved one and the phone's own when neither is on the list. */
export function timezoneOptions(saved: string, device: string | null): SelectOption[] {
  const zones = [...COMMON_TIMEZONES];
  for (const extra of [saved, device]) {
    if (extra && !zones.includes(extra)) {
      zones.unshift(extra);
    }
  }
  return zones.map((zone) => ({
    value: zone,
    label: zone.replace(/_/g, ' '),
    ...(zone === device ? { description: 'This device' } : {}),
  }));
}
