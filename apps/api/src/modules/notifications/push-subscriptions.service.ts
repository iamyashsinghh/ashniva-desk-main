import { BadRequestException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { isAllowedPushEndpoint } from './channels/web-push.channel';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
}

/**
 * Browser Web Push subscriptions for the signed-in person.
 *
 * One row per browser endpoint. Re-subscribing the same endpoint updates keys and re-binds the
 * row to the current user/org (a shared machine signing in as someone else must not keep pushing
 * to the previous account).
 */
@Injectable()
export class PushSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(actor: AuthenticatedUser, input: PushSubscriptionInput): Promise<void> {
    const endpoint = input.endpoint.trim();
    const p256dh = input.keys.p256dh.trim();
    const auth = input.keys.auth.trim();
    if (!endpoint || !p256dh || !auth) {
      throw new BadRequestException('Push subscription is incomplete');
    }
    if (!isAllowedPushEndpoint(endpoint)) {
      throw new BadRequestException('Push endpoint is not from a known push service');
    }

    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        endpoint,
        p256dh,
        auth,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
      update: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        p256dh,
        auth,
        userAgent: input.userAgent?.slice(0, 512) ?? null,
      },
    });
  }

  async unsubscribe(actor: AuthenticatedUser, endpoint: string): Promise<void> {
    const trimmed = endpoint.trim();
    if (!trimmed) {
      throw new BadRequestException('Push endpoint is required');
    }
    await this.prisma.pushSubscription.deleteMany({
      where: {
        endpoint: trimmed,
        userId: actor.userId,
        organizationId: actor.organizationId,
      },
    });
  }
}
