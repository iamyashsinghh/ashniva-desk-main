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
  /** One entry per (type, channel); missing entries mean "enabled" for IN_APP, disabled otherwise. */
  entries: NotificationPreferenceEntry[];
  quietHoursEnabled: boolean;
  /** "22:00" */
  quietHoursStart: string;
  /** "07:00" */
  quietHoursEnd: string;
  timezone: string;
}

/** Realtime payload for `notification.new`. */
export interface NotificationEvent {
  notification: NotificationSummary;
  unreadCount: number;
}
