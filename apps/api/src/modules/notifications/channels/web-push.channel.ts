import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import webpush from 'web-push';

import { AppConfigService } from '../../../config/app-config.service';
import { PrismaService } from '../../../database/prisma.service';
import type {
  NotificationChannel,
  NotificationMessage,
} from './notification-channel.interface';

/**
 * Hosts browsers use for Web Push. Subscription endpoints are user-supplied, so we only talk to
 * these known push services — never an arbitrary URL that could probe the private network.
 */
const PUSH_ENDPOINT_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
] as const;

/**
 * Delivers every notification the dispatcher already approved for the PUSH channel to each of
 * the recipient's browser subscriptions. Gone endpoints (410/404) are dropped so we stop
 * retrying dead devices.
 */
@Injectable()
export class WebPushNotificationChannel implements NotificationChannel {
  readonly key = 'PUSH' as const;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WebPushNotificationChannel.name);
    const vapid = this.config.webPush;
    if (vapid.publicKey && vapid.privateKey) {
      webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    }
  }

  isConfigured(): boolean {
    const vapid = this.config.webPush;
    return Boolean(vapid.publicKey && vapid.privateKey);
  }

  async send(message: NotificationMessage): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: {
        userId: message.recipientUserId,
        organizationId: message.organizationId,
      },
    });
    if (subscriptions.length === 0) {
      return;
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body ?? '',
      link: message.link ?? '/',
      tag: `ashniva:${message.type}:${message.link ?? ''}`,
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        if (!isAllowedPushEndpoint(subscription.endpoint)) {
          this.logger.warn(
            { subscriptionId: subscription.id },
            'Dropping push subscription with disallowed endpoint',
          );
          await this.prisma.pushSubscription.delete({ where: { id: subscription.id } });
          return;
        }
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
            { TTL: 60 * 60 },
          );
        } catch (error) {
          const status = statusCodeOf(error);
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: subscription.id } });
            return;
          }
          this.logger.warn(
            { err: error, subscriptionId: subscription.id },
            'Web Push delivery failed',
          );
        }
      }),
    );
  }
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return PUSH_ENDPOINT_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

function statusCodeOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    return typeof code === 'number' ? code : null;
  }
  return null;
}
