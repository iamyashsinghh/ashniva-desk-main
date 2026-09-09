import { NOTIFICATION_CHANNEL, type NotificationType } from '@ashniva/types';

import { defaultChannelEnabled, type QuietHours } from './notification-rules';
import type {
  NotificationPreferenceRow,
  NotificationsRepository,
} from './notifications.repository';
import type { Recipient } from './recipients.service';

/** Which channels this person receives this type on, and the quiet hours that apply to them. */
export interface RecipientState {
  channels: Record<string, boolean>;
  settings: QuietHours;
}

const CHANNELS = Object.values(NOTIFICATION_CHANNEL);

export function recipientKey(recipient: Recipient): string {
  return `${recipient.organizationId}:${recipient.userId}`;
}

/** The stored preferences for one type, over the defaults for the channels nobody has answered. */
export function channelsFor(
  rows: readonly NotificationPreferenceRow[],
  type: NotificationType,
): Record<string, boolean> {
  const channels: Record<string, boolean> = {};
  for (const channel of CHANNELS) {
    channels[channel] = defaultChannelEnabled(channel);
  }
  for (const row of rows) {
    if (row.type === type) {
      channels[row.channel] = row.enabled;
    }
  }
  return channels;
}

/**
 * The preferences and quiet hours for a whole recipient set, in two queries per organization.
 *
 * A ticket that fans out to everyone who triages tickets used to ask the database for one
 * person's preferences and one person's settings at a time, inside the request that raised the
 * ticket — two round trips per recipient, in series. The set is known up front, so it is read up
 * front; what the dispatcher does with it afterwards is unchanged, and still one recipient at a
 * time, because the rate limit counts the rows the same pass has just written.
 */
export async function loadRecipientState(
  notifications: NotificationsRepository,
  recipients: readonly Recipient[],
  type: NotificationType,
): Promise<Map<string, RecipientState>> {
  const byOrganization = new Map<string, string[]>();
  for (const recipient of recipients) {
    const users = byOrganization.get(recipient.organizationId) ?? [];
    users.push(recipient.userId);
    byOrganization.set(recipient.organizationId, users);
  }

  const states = new Map<string, RecipientState>();
  for (const [organizationId, userIds] of byOrganization) {
    const [preferences, settings] = await Promise.all([
      notifications.preferencesForUsers(userIds, organizationId),
      notifications.settingsForUsers(userIds, organizationId),
    ]);
    const preferencesByUser = new Map<string, NotificationPreferenceRow[]>();
    for (const row of preferences) {
      preferencesByUser.set(row.userId, [...(preferencesByUser.get(row.userId) ?? []), row]);
    }
    const settingsByUser = new Map(settings.map((row) => [row.userId, row]));
    for (const userId of userIds) {
      states.set(`${organizationId}:${userId}`, {
        channels: channelsFor(preferencesByUser.get(userId) ?? [], type),
        settings:
          settingsByUser.get(userId) ?? notifications.defaultSettings(userId, organizationId),
      });
    }
  }
  return states;
}
