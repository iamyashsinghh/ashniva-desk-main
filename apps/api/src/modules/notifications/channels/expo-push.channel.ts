import { Injectable } from '@nestjs/common';
import type { NativePushData } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { AppConfigService } from '../../../config/app-config.service';
import {
  BlockedRequestError,
  SafeHttpService,
} from '../../../infrastructure/http/safe-http.service';
import { DevicePushTokensService } from '../device-push-tokens.service';
import { NotificationsRepository } from '../notifications.repository';
import type { NotificationChannel, NotificationMessage } from './notification-channel.interface';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo's documented ceiling for one request. */
export const EXPO_BATCH_SIZE = 100;
const TIMEOUT_MS = 15_000;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  /** The Android notification channel the app creates at start-up. */
  channelId: 'default';
  data: NativePushData;
  badge?: number;
}

interface ExpoPushTicket {
  status?: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Delivers every notification the dispatcher already approved for the PUSH channel to the
 * recipient's phones, through Expo's push service. Shares the key with Web Push, so the one
 * "Push notifications" preference — and quiet hours and the rate limit, which the dispatcher
 * applies before any channel is called — covers browsers and phones alike.
 *
 * Tokens Expo reports as `DeviceNotRegistered` are deleted so dead installs stop being tried.
 * A delivery failure is logged and stepped over, never thrown, and never logged with a token:
 * the token is what addresses a person's phone.
 */
@Injectable()
export class ExpoPushNotificationChannel implements NotificationChannel {
  readonly key = 'PUSH' as const;

  constructor(
    private readonly tokens: DevicePushTokensService,
    private readonly notifications: NotificationsRepository,
    private readonly http: SafeHttpService,
    private readonly tenantContext: TenantContextService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExpoPushNotificationChannel.name);
  }

  isConfigured(): boolean {
    return this.config.expoPush.enabled;
  }

  /**
   * As the system: the operator's "deliver now" route calls this under its own tenant, and every
   * query here is already scoped to the recipient's organization and user explicitly.
   */
  send(message: NotificationMessage): Promise<void> {
    if (!this.isConfigured()) {
      return Promise.resolve();
    }
    return this.tenantContext.runAsSystem(() => this.deliver(message));
  }

  private async deliver(message: NotificationMessage): Promise<void> {
    const tokens = await this.tokens.tokensFor(message.organizationId, [message.recipientUserId]);
    if (tokens.length === 0) {
      return;
    }
    const badge = await this.badgeFor(message.recipientUserId);
    const data: NativePushData = {
      notificationId: message.notificationId,
      groupedCount: message.groupedCount,
      type: message.type,
      link: message.link,
      entityType: message.entityType,
      entityId: message.entityId,
    };
    const messages: ExpoPushMessage[] = tokens.map((to) => ({
      to,
      title: message.title,
      body: message.body ?? '',
      sound: 'default',
      priority: 'high',
      channelId: 'default',
      data,
      ...(badge === null ? {} : { badge }),
    }));

    const gone: string[] = [];
    for (let start = 0; start < messages.length; start += EXPO_BATCH_SIZE) {
      gone.push(...(await this.sendBatch(messages.slice(start, start + EXPO_BATCH_SIZE))));
    }
    if (gone.length > 0) {
      try {
        await this.tokens.remove(gone);
      } catch (error) {
        this.logger.warn({ err: error, count: gone.length }, 'Could not drop dead push tokens');
      }
    }
  }

  /** The app icon badge. Nice to have, so a failed count sends the push without one. */
  private async badgeFor(userId: string): Promise<number | null> {
    try {
      return await this.notifications.unreadCount(userId);
    } catch {
      return null;
    }
  }

  /** Sends one batch and returns the tokens Expo says no longer reach a device. */
  private async sendBatch(batch: ExpoPushMessage[]): Promise<string[]> {
    try {
      const response = await this.http.fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(batch),
        timeoutMs: TIMEOUT_MS,
      });
      if (!response.ok) {
        this.logger.warn(
          { status: response.status, count: batch.length },
          'Expo push request was refused',
        );
        return [];
      }
      const payload = (await response.json()) as { data?: unknown };
      const tickets = Array.isArray(payload.data) ? (payload.data as ExpoPushTicket[]) : [];
      return this.deadTokens(batch, tickets);
    } catch (error) {
      if (error instanceof BlockedRequestError) {
        this.http.logRefusal(error, 'Expo push');
      } else {
        this.logger.warn({ err: error, count: batch.length }, 'Expo push delivery failed');
      }
      return [];
    }
  }

  /** Tickets come back in the order the messages were sent. */
  private deadTokens(batch: ExpoPushMessage[], tickets: ExpoPushTicket[]): string[] {
    const dead: string[] = [];
    const otherErrors: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket?.status !== 'error') {
        return;
      }
      const reason = ticket.details?.error ?? 'Unknown';
      const token = batch[index]?.to;
      if (reason === 'DeviceNotRegistered' && token) {
        dead.push(token);
      } else {
        otherErrors.push(reason);
      }
    });
    if (otherErrors.length > 0) {
      this.logger.warn({ errors: otherErrors }, 'Expo rejected some push messages');
    }
    return dead;
  }

  private headers(): Record<string, string> {
    const accessToken = this.config.expoPush.accessToken;
    return {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    };
  }
}
