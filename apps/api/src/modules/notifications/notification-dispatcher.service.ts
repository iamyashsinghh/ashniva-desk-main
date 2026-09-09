import { Inject, Injectable } from '@nestjs/common';
import { URGENT_NOTIFICATION_TYPES, type NotificationType } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
} from './channels/notification-channel.interface';
import {
  DEDUPE_WINDOW_MS,
  GROUP_WINDOW_MS,
  RATE_LIMIT_DEFER_MS,
  RATE_LIMIT_PER_MINUTE,
  quietHoursDeferral,
  type QuietHours,
} from './notification-rules';
import { toNotificationSummary } from './notifications.mapper';
import { NotificationsRepository, type NotificationRow } from './notifications.repository';
import {
  channelsFor,
  loadRecipientState,
  recipientKey,
  type RecipientState,
} from './recipient-state';
import type { Recipient } from './recipients.service';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Route to open; callers pass the internal or portal route matching the recipient set. */
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Same key within 24h for the same person → dropped (retries, repeated jobs). */
  dedupeKey?: string | null;
  /** Same key, unread, within 30 minutes → merged into one row with a counter. */
  groupKey?: string | null;
  recipients: Recipient[];
  /** Usually the actor: nobody is notified about their own action. */
  excludeUserId?: string | null;
}

export interface NotifyResult {
  created: number;
  grouped: number;
  skipped: number;
  deferred: number;
}

/**
 * The one way to send a notification. Applies, per recipient: preferences, de-duplication,
 * grouping, quiet hours and rate limiting; writes the row; pushes it over Socket.IO or defers
 * it; then hands it to any configured external channel. Runs as the system so a client action
 * can notify provider staff (and the reverse) under row-level security.
 *
 * Channels are decided one at a time. Switching the in-app channel off used to end the dispatch
 * before the external channels were consulted, so "email but not in app" delivered nothing at
 * all; the pipeline above is per notification, the delivery below is per channel.
 */
@Injectable()
export class NotificationDispatcher {
  constructor(
    private readonly notifications: NotificationsRepository,
    private readonly realtime: RealtimeService,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {
    this.logger.setContext(NotificationDispatcher.name);
  }

  notify(input: NotifyInput, now = new Date()): Promise<NotifyResult> {
    return this.tenantContext.runAsSystem(() => this.dispatch(input, now));
  }

  /**
   * Delivers a notification that was held back for quiet hours or the rate limit.
   *
   * This is where a deferred notification's email and WhatsApp are sent — not when it was first
   * created. `dispatchOne` handles the immediate case itself, so the external send happens once
   * either way.
   */
  async deliverDeferred(row: NotificationRow, at = new Date()): Promise<void> {
    const recipient = { userId: row.userId, organizationId: row.organizationId };
    const type = row.type as NotificationType;
    const stored = await this.notifications.preferences(row.userId, row.organizationId);
    const enabled = channelsFor(stored, type);
    if (this.inAppEnabled(enabled, type)) {
      await this.deliver(row, at);
    } else {
      // In-app is off for this person: the row stays undelivered so it never appears in their
      // inbox, and loses its due time so the delivery job stops picking it up.
      await this.notifications.clearDeferral(row.id);
    }
    await this.sendExternal(
      { type, title: row.title, body: row.body, link: row.link },
      recipient,
      this.externalChannels(enabled),
    );
  }

  /** Pushes a stored row to the recipient's browser tabs and marks it delivered. */
  async deliver(row: NotificationRow, at = new Date()): Promise<void> {
    if (!row.deliveredAt) {
      await this.notifications.markDelivered([row.id], at);
    }
    const unreadCount = await this.notifications.unreadCount(row.userId);
    this.realtime.emitNotification(row.userId, {
      notification: toNotificationSummary({ ...row, deliveredAt: row.deliveredAt ?? at }),
      unreadCount,
    });
  }

  private async dispatch(input: NotifyInput, now: Date): Promise<NotifyResult> {
    const result: NotifyResult = { created: 0, grouped: 0, skipped: 0, deferred: 0 };
    const seen = new Set<string>();
    const recipients = input.recipients.filter((recipient) => {
      if (recipient.userId === input.excludeUserId || seen.has(recipient.userId)) {
        return false;
      }
      seen.add(recipient.userId);
      return true;
    });
    const states = await loadRecipientState(this.notifications, recipients, input.type);
    for (const recipient of recipients) {
      try {
        const outcome = await this.dispatchOne(input, recipient, now, states);
        result[outcome] += 1;
      } catch (error) {
        this.logger.error(
          { err: error, type: input.type, userId: recipient.userId },
          'Notification failed',
        );
        result.skipped += 1;
      }
    }
    return result;
  }

  private async dispatchOne(
    input: NotifyInput,
    recipient: Recipient,
    now: Date,
    states: Map<string, RecipientState>,
  ): Promise<keyof NotifyResult> {
    const urgent = URGENT_NOTIFICATION_TYPES.includes(input.type);
    const state = states.get(recipientKey(recipient));
    const enabled = state?.channels ?? channelsFor([], input.type);
    const inApp = this.inAppEnabled(enabled, input.type);
    const external = this.externalChannels(enabled);
    if (!inApp && external.length === 0) {
      return 'skipped';
    }
    if (input.dedupeKey) {
      const duplicate = await this.notifications.findByDedupeKey(
        recipient.userId,
        input.dedupeKey,
        new Date(now.getTime() - DEDUPE_WINDOW_MS),
      );
      if (duplicate) {
        return 'skipped';
      }
    }
    if (input.groupKey) {
      const existing = await this.notifications.findGroupable(
        recipient.userId,
        input.groupKey,
        new Date(now.getTime() - GROUP_WINDOW_MS),
      );
      if (existing) {
        const bumped = await this.notifications.bumpGroup(
          existing.id,
          input.title,
          input.body ?? null,
        );
        if (bumped.deliveredAt) {
          await this.deliver(bumped, now);
        }
        return 'grouped';
      }
    }
    const deliverAfter = urgent
      ? null
      : await this.deferral(recipient, now, state?.settings ?? null);
    const row = await this.notifications.create({
      organizationId: recipient.organizationId,
      userId: recipient.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      dedupeKey: input.dedupeKey ?? null,
      groupKey: input.groupKey ?? null,
      deliverAfter,
      // A row nobody will see in the app is still written: it is what de-duplication, grouping
      // and the rate limit count. Leaving `deliveredAt` null keeps it out of the inbox and the
      // badge, which is what switching the in-app channel off asked for.
      deliveredAt: deliverAfter || !inApp ? null : now,
    });
    if (deliverAfter) {
      // Quiet hours or the rate limit. The email and WhatsApp go out with the notification when
      // it is finally delivered, not now — the whole point of quiet hours is that a phone does
      // not light up at 3am, and sending the mail immediately would defeat it.
      return 'deferred';
    }
    if (inApp) {
      await this.deliver(row, now);
    }
    await this.sendExternal(input, recipient, external);
    return 'created';
  }

  /**
   * The in-app channel, which the urgent types reach whatever the preference says.
   *
   * Deliberate, and unchanged: an SLA breach or a ringing telephone is the one thing somebody
   * cannot have switched off by muting a category, and it has nowhere else to arrive.
   */
  private inAppEnabled(enabled: Record<string, boolean>, type: NotificationType): boolean {
    return enabled.IN_APP === true || URGENT_NOTIFICATION_TYPES.includes(type);
  }

  /** The external adapters this person has switched on and that have a provider behind them. */
  private externalChannels(enabled: Record<string, boolean>): NotificationChannel[] {
    return this.channels.filter((channel) => enabled[channel.key] && channel.isConfigured());
  }

  /** Quiet hours first, then the per-minute rate limit; both defer rather than drop. */
  private async deferral(
    recipient: Recipient,
    now: Date,
    loaded: QuietHours | null,
  ): Promise<Date | null> {
    const settings =
      loaded ?? (await this.notifications.settings(recipient.userId, recipient.organizationId));
    const quiet = quietHoursDeferral(now, settings);
    if (quiet) {
      return quiet;
    }
    const recent = await this.notifications.countSince(
      recipient.userId,
      new Date(now.getTime() - RATE_LIMIT_DEFER_MS),
    );
    return recent >= RATE_LIMIT_PER_MINUTE ? new Date(now.getTime() + RATE_LIMIT_DEFER_MS) : null;
  }

  /**
   * Hands the notification to each configured external channel.
   *
   * A channel failure is logged and stepped over rather than thrown. The in-app notification is
   * already written and delivered by this point; letting a mail server outage turn that into a
   * "skipped" result would misreport work that actually succeeded.
   */
  private async sendExternal(
    input: Pick<NotifyInput, 'type' | 'title' | 'body' | 'link'>,
    recipient: Pick<Recipient, 'userId' | 'organizationId'>,
    channels: readonly NotificationChannel[],
  ): Promise<void> {
    for (const channel of channels) {
      try {
        await channel.send({
          recipientUserId: recipient.userId,
          organizationId: recipient.organizationId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          link: input.link ?? null,
        });
      } catch (error) {
        this.logger.warn(
          { err: error, channel: channel.key, type: input.type },
          'External notification channel failed',
        );
      }
    }
  }
}
