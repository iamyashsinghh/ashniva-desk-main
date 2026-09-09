import type { NotificationSummary, NotificationType } from '@ashniva/types';

import type { NotificationRow } from './notifications.repository';

export function toNotificationSummary(row: NotificationRow): NotificationSummary {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    link: row.link,
    entityType: row.entityType,
    entityId: row.entityId,
    groupedCount: row.groupedCount,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
