import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type NotificationChannel,
  type NotificationListResponse,
  type NotificationPreferences,
  type NotificationType,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  ListNotificationsQueryDto,
  UpdateNotificationPreferencesDto,
} from './dto/notification.dto';
import { toNotificationSummary } from './notifications.mapper';
import { NotificationsRepository } from './notifications.repository';

/** The signed-in person's inbox and preferences; always scoped by their user id. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListNotificationsQueryDto,
  ): Promise<NotificationListResponse> {
    const [page, unreadCount] = await Promise.all([
      this.notifications.list({
        userId: actor.userId,
        unreadOnly: query.unread,
        limit: query.limit,
        cursor: query.cursor,
      }),
      this.notifications.unreadCount(actor.userId),
    ]);
    return {
      items: page.items.map(toNotificationSummary),
      nextCursor: page.nextCursor,
      unreadCount,
    };
  }

  async unreadCount(actor: AuthenticatedUser): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.notifications.unreadCount(actor.userId) };
  }

  async markRead(actor: AuthenticatedUser, id: string): Promise<{ unreadCount: number }> {
    const row = await this.notifications.findForUser(actor.userId, id);
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    await this.notifications.markRead(actor.userId, id);
    return this.unreadCount(actor);
  }

  async markAllRead(actor: AuthenticatedUser): Promise<{ updated: number; unreadCount: number }> {
    const updated = await this.notifications.markAllRead(actor.userId);
    return { updated, unreadCount: 0 };
  }

  async preferences(actor: AuthenticatedUser): Promise<NotificationPreferences> {
    const [rows, settings] = await Promise.all([
      this.notifications.preferences(actor.userId, actor.organizationId),
      this.notifications.settings(actor.userId, actor.organizationId),
    ]);
    return {
      entries: rows.map((row) => ({
        type: row.type as NotificationType,
        channel: row.channel as NotificationChannel,
        enabled: row.enabled,
      })),
      quietHoursEnabled: settings.quietHoursEnabled,
      quietHoursStart: settings.quietHoursStart,
      quietHoursEnd: settings.quietHoursEnd,
      timezone: settings.timezone,
    };
  }

  async updatePreferences(
    actor: AuthenticatedUser,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferences> {
    await this.notifications.upsertPreferences(
      actor.userId,
      actor.organizationId,
      dto.entries ?? [],
    );
    const settings = {
      ...(dto.quietHoursEnabled !== undefined ? { quietHoursEnabled: dto.quietHoursEnabled } : {}),
      ...(dto.quietHoursStart !== undefined ? { quietHoursStart: dto.quietHoursStart } : {}),
      ...(dto.quietHoursEnd !== undefined ? { quietHoursEnd: dto.quietHoursEnd } : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
    };
    if (Object.keys(settings).length > 0) {
      await this.notifications.upsertSettings(actor.userId, actor.organizationId, settings);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.NOTIFICATION_PREFERENCES_CHANGED,
      entityType: AUDIT_ENTITY_TYPE.NOTIFICATION,
      entityId: actor.userId,
      after: { entries: dto.entries?.length ?? 0, ...settings },
    });
    return this.preferences(actor);
  }
}
