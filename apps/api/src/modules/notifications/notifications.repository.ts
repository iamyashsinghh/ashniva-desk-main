import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type {
  Notification,
  NotificationChannel,
  NotificationSetting,
  NotificationType,
  Prisma,
} from '../../generated/prisma/client';

export type NotificationRow = Notification;

export interface NotificationListFilter {
  userId: string;
  unreadOnly?: boolean;
  limit: number;
  cursor?: string;
}

export interface NotificationPreferenceInput {
  type: NotificationType;
  channel: NotificationChannel;
  enabled: boolean;
}

export type NotificationPreferenceRow = Awaited<
  ReturnType<NotificationsRepository['preferences']>
>[number];

const DEFAULT_SETTINGS = {
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: 'Asia/Kolkata',
};

/** Notification rows are always scoped by the recipient; nobody lists another person's inbox. */
@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: NotificationListFilter,
  ): Promise<{ items: NotificationRow[]; nextCursor: string | null }> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId: filter.userId,
        deliveredAt: { not: null },
        ...(filter.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, deliveredAt: { not: null } },
    });
  }

  findForUser(userId: string, id: string): Promise<NotificationRow | null> {
    return this.prisma.notification.findFirst({ where: { id, userId } });
  }

  markRead(userId: string, id: string, at = new Date()): Promise<number> {
    return this.prisma.notification
      .updateMany({ where: { id, userId, readAt: null }, data: { readAt: at } })
      .then((result) => result.count);
  }

  markAllRead(userId: string, at = new Date()): Promise<number> {
    return this.prisma.notification
      .updateMany({ where: { userId, readAt: null }, data: { readAt: at } })
      .then((result) => result.count);
  }

  create(data: Prisma.NotificationUncheckedCreateInput): Promise<NotificationRow> {
    return this.prisma.notification.create({ data });
  }

  findByDedupeKey(userId: string, dedupeKey: string, since: Date): Promise<NotificationRow | null> {
    return this.prisma.notification.findFirst({
      where: { userId, dedupeKey, createdAt: { gte: since } },
    });
  }

  findGroupable(userId: string, groupKey: string, since: Date): Promise<NotificationRow | null> {
    return this.prisma.notification.findFirst({
      where: { userId, groupKey, readAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });
  }

  bumpGroup(id: string, title: string, body: string | null): Promise<NotificationRow> {
    return this.prisma.notification.update({
      where: { id },
      data: { title, body, groupedCount: { increment: 1 } },
    });
  }

  countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.notification.count({ where: { userId, createdAt: { gte: since } } });
  }

  /** Deferred rows (quiet hours / rate limit) whose time has come. */
  dueForDelivery(now: Date, take = 500): Promise<NotificationRow[]> {
    return this.prisma.notification.findMany({
      where: { deliveredAt: null, deliverAfter: { lte: now } },
      orderBy: { deliverAfter: 'asc' },
      take,
    });
  }

  markDelivered(ids: string[], at: Date): Promise<number> {
    return this.prisma.notification
      .updateMany({ where: { id: { in: ids } }, data: { deliveredAt: at, deliverAfter: null } })
      .then((result) => result.count);
  }

  /**
   * Drops a deferred row's due time without delivering it.
   *
   * For the person who has switched the in-app channel off: the row stays as the ledger
   * de-duplication, grouping and the rate limit are counted from, but it is never delivered, so
   * it stays out of the inbox and the badge — and, with no `deliverAfter`, out of the delivery
   * job's way instead of being picked up again every minute.
   */
  clearDeferral(id: string): Promise<number> {
    return this.prisma.notification
      .updateMany({ where: { id, deliveredAt: null }, data: { deliverAfter: null } })
      .then((result) => result.count);
  }

  // ---- preferences --------------------------------------------------------------------------

  preferences(userId: string, organizationId: string) {
    return this.prisma.notificationPreference.findMany({ where: { userId, organizationId } });
  }

  /** Every preference row for a whole recipient set, in one query. */
  preferencesForUsers(userIds: string[], organizationId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId: { in: userIds }, organizationId },
    });
  }

  /**
   * Saves a set of preferences in one round trip.
   *
   * A transaction of upserts rather than a loop of them: the unique key is
   * (user, organization, type, channel), so each entry has to be an upsert, but sending them one
   * at a time cost a connection checkout and a round trip each — and a save that half-applied
   * because the eightieth failed left the person's settings in a state they never chose.
   */
  async upsertPreferences(
    userId: string,
    organizationId: string,
    entries: readonly NotificationPreferenceInput[],
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }
    await this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.notificationPreference.upsert({
          where: {
            userId_organizationId_type_channel: {
              userId,
              organizationId,
              type: entry.type,
              channel: entry.channel,
            },
          },
          update: { enabled: entry.enabled },
          create: {
            userId,
            organizationId,
            type: entry.type,
            channel: entry.channel,
            enabled: entry.enabled,
          },
        }),
      ),
    );
  }

  async settings(userId: string, organizationId: string): Promise<NotificationSetting> {
    const row = await this.prisma.notificationSetting.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return row ?? this.defaultSettings(userId, organizationId);
  }

  /** Settings for a whole recipient set, in one query; callers fill the gaps with the defaults. */
  settingsForUsers(userIds: string[], organizationId: string): Promise<NotificationSetting[]> {
    return this.prisma.notificationSetting.findMany({
      where: { userId: { in: userIds }, organizationId },
    });
  }

  defaultSettings(userId: string, organizationId: string): NotificationSetting {
    return { userId, organizationId, ...DEFAULT_SETTINGS, updatedAt: new Date() };
  }

  async upsertSettings(
    userId: string,
    organizationId: string,
    data: Partial<typeof DEFAULT_SETTINGS>,
  ): Promise<NotificationSetting> {
    return this.prisma.notificationSetting.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      update: data,
      create: { userId, organizationId, ...DEFAULT_SETTINGS, ...data },
    });
  }
}
