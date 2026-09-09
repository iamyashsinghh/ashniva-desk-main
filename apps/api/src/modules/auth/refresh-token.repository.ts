import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { RefreshToken } from '../../generated/prisma/client';

export interface CreateRefreshTokenInput {
  userId: string;
  organizationId: string | null;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/** Data access for refresh tokens. Used only by RefreshTokenService. */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data: input });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  async markReplaced(id: string, replacedByTokenId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt, replacedByTokenId },
    });
  }

  async revokeById(id: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeFamily(familyId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt },
    });
  }

  async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt },
    });
  }
}
