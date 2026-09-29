import { Injectable } from '@nestjs/common';
import type { PushDevicePlatform } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';

export interface DevicePushTokenInput {
  organizationId: string;
  userId: string;
  token: string;
  platform: PushDevicePlatform;
  lastSeenAt: Date;
}

/** Data access for native push tokens. Every read names the organization it is for. */
@Injectable()
export class DevicePushTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** One row per token: registering a known token re-binds it to whoever registered it last. */
  async upsert(input: DevicePushTokenInput): Promise<void> {
    const owner = {
      organizationId: input.organizationId,
      userId: input.userId,
      platform: input.platform,
      lastSeenAt: input.lastSeenAt,
    };
    await this.prisma.devicePushToken.upsert({
      where: { token: input.token },
      create: { ...owner, token: input.token },
      update: owner,
    });
  }

  deleteOwned(organizationId: string, userId: string, token: string): Promise<number> {
    return this.prisma.devicePushToken
      .deleteMany({ where: { token, userId, organizationId } })
      .then((result) => result.count);
  }

  async tokensFor(organizationId: string, userIds: readonly string[]): Promise<string[]> {
    const rows = await this.prisma.devicePushToken.findMany({
      where: { organizationId, userId: { in: [...userIds] } },
      select: { token: true },
    });
    return rows.map((row) => row.token);
  }

  deleteTokens(tokens: readonly string[]): Promise<number> {
    return this.prisma.devicePushToken
      .deleteMany({ where: { token: { in: [...tokens] } } })
      .then((result) => result.count);
  }
}
