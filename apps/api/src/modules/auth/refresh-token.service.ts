import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { RefreshTokenRepository } from './refresh-token.repository';

export interface IssuedRefreshToken {
  /** The opaque value handed to the client (only ever seen once). */
  token: string;
  familyId: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  userId: string;
  /** Organization the original session was opened for. */
  organizationId: string | null;
}

export interface ClientMetadata {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Opaque refresh tokens with rotation and reuse detection:
 * - The database stores only a SHA-256 hash of the token.
 * - Every refresh revokes the presented token and issues a replacement in the same family.
 * - Presenting a token that was already rotated (theft indicator) revokes the whole family.
 */
@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly repository: RefreshTokenRepository,
    private readonly config: AppConfigService,
  ) {}

  async issue(
    userId: string,
    organizationId: string | null = null,
    metadata: ClientMetadata = {},
  ): Promise<IssuedRefreshToken> {
    return this.createToken(userId, organizationId, randomUUID(), metadata);
  }

  async rotate(
    presentedToken: string,
    metadata: ClientMetadata = {},
  ): Promise<RotatedRefreshToken> {
    const now = new Date();
    const existing = await this.repository.findByHash(this.hashToken(presentedToken));

    if (!existing) {
      throw new UnauthorizedException('Refresh token is not valid');
    }
    if (existing.revokedAt) {
      // Reuse of a rotated token means it may have been stolen: log everyone in this family out.
      await this.repository.revokeFamily(existing.familyId, now);
      throw new UnauthorizedException('Refresh token was already used');
    }
    if (existing.expiresAt <= now) {
      await this.repository.revokeById(existing.id, now);
      throw new UnauthorizedException('Refresh token has expired');
    }

    const replacement = await this.createToken(
      existing.userId,
      existing.organizationId,
      existing.familyId,
      metadata,
    );
    await this.repository.markReplaced(existing.id, replacement.id, now);

    return {
      token: replacement.token,
      familyId: replacement.familyId,
      expiresAt: replacement.expiresAt,
      userId: existing.userId,
      organizationId: existing.organizationId,
    };
  }

  async revoke(presentedToken: string): Promise<void> {
    const existing = await this.repository.findByHash(this.hashToken(presentedToken));
    if (existing) {
      await this.repository.revokeById(existing.id, new Date());
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.revokeAllForUser(userId, new Date());
  }

  private async createToken(
    userId: string,
    organizationId: string | null,
    familyId: string,
    metadata: ClientMetadata,
  ) {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.jwt.refreshTtlSeconds * 1000);
    const record = await this.repository.create({
      userId,
      organizationId,
      familyId,
      expiresAt,
      tokenHash: this.hashToken(token),
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    });
    return { id: record.id, token, familyId, expiresAt };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
