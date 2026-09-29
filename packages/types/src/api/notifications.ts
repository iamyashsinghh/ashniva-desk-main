import type { NotificationChannel, NotificationType } from '../domain/notification-type';

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** In-app route to open (internal or portal, chosen for the recipient). */
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  /** Number of merged events when several of the same kind were grouped. */
  groupedCount: number;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationSummary[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationPreferenceEntry {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationPreferences {
  /** One entry per (type, channel); missing entries mean "enabled" for IN_APP and PUSH. */
  entries: NotificationPreferenceEntry[];
  quietHoursEnabled: boolean;
  /** "22:00" */
  quietHoursStart: string;
  /** "07:00" */
  quietHoursEnd: string;
  timezone: string;
}

/** Platforms a native device token can belong to. */
export const PUSH_DEVICE_PLATFORMS = ['IOS', 'ANDROID'] as const;
export type PushDevicePlatform = (typeof PUSH_DEVICE_PLATFORMS)[number];

/** `POST /notifications/push/devices` — file this phone's Expo push token against the caller. */
export interface RegisterPushDeviceRequest {
  /** An Expo push token: `ExponentPushToken[…]`. */
  token: string;
  platform: PushDevicePlatform;
}

/** `POST /notifications/push/devices/unregister` — forget a token (sign-out, permission revoked). */
export interface UnregisterPushDeviceRequest {
  token: string;
}

/**
 * The `data` block of a native push message. `link` is the same web route the in-app
 * notification carries; the app translates it to a screen, and falls back to the alerts list.
 */
export interface NativePushData {
  notificationId: string;
  /**
   * How many events the notification row has merged. A grouped row keeps its id, so the app tells
   * a second reply on a ticket apart from a repeat of the first by this count.
   */
  groupedCount: number;
  type: NotificationType;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
}

/** Realtime payload for `notification.new`. */
export interface NotificationEvent {
  notification: NotificationSummary;
  unreadCount: number;
}
