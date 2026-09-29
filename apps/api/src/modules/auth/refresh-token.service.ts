import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import type { RefreshToken } from '../../generated/prisma/client';
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
 * How long a rotated token may still be exchanged, for the live end of its own chain.
 *
 * A rotation's reply can be lost after the server has committed it: an app reloaded mid-request,
 * a phone that lost signal, two browser tabs refreshing at the same moment. The client then
 * presents the token it still holds — now spent — and without a grace period that reads as theft
 * and signs the person out everywhere. Within this window a spent token instead rotates the live
 * token its chain leads to, so there is still exactly one live token per family. Outside it, or
 * when the chain ends in a revocation rather than a live token (a logout, a password change, a
 * detected theft), reuse is theft as before.
 *
 * One case needs no window: a token that was itself presented, whose replacement has never been.
 * Nobody holds that replacement — the reply carrying it was lost, or the request failed after the
 * rotation committed — so the client is asking again, not replaying, however long it has been
 * since (a phone locked mid-refresh and opened the next morning). A thief who wins that race
 * still loses: the replacement it retired was never presented, so the real device's next refresh
 * gets only the window, and after it revokes the family.
 */
export const ROTATION_GRACE_MS = 30_000;

/** A chain longer than this within the grace window is not a lost reply; it is somebody replaying. */
const MAX_GRACE_HOPS = 5;

/**
 * Opaque refresh tokens with rotation and reuse detection:
 * - The database stores only a SHA-256 hash of the token.
 * - Every refresh revokes the presented token and issues a replacement in the same family.
 * - Presenting a token that was already rotated (theft indicator) revokes the whole family —
 *   except within `ROTATION_GRACE_MS` of its rotation, when its chain still ends in a live token.
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
    const presented = await this.repository.findByHash(this.hashToken(presentedToken));

    if (!presented) {
      throw new UnauthorizedException('Refresh token is not valid');
    }
    let existing = presented;
    if (presented.revokedAt) {
      const live = await this.liveEndWithinGrace(presented, now);
      if (!live) {
        // Reuse of a rotated token means it may have been stolen: log everyone in this family out.
        await this.repository.revokeFamily(presented.familyId, now);
        throw new UnauthorizedException('Refresh token was already used');
      }
      existing = live;
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
    await this.repository.markReplaced(existing.id, replacement.id, now, existing === presented);

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

  /** Looks up the session behind a refresh cookie without rotating or revoking it. */
  async peek(
    presentedToken: string,
  ): Promise<{ userId: string; organizationId: string | null } | null> {
    const existing = await this.repository.findByHash(this.hashToken(presentedToken));
    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
      return null;
    }
    return { userId: existing.userId, organizationId: existing.organizationId };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.revokeAllForUser(userId, new Date());
  }

  /**
   * Follows a spent token's replacements to the family's live token, if every step was a rotation
   * inside the grace window — or the spent token's own replacement was never claimed. Null when
   * any step was a revocation, happened too long ago, or the chain is suspiciously long.
   */
  private async liveEndWithinGrace(spent: RefreshToken, now: Date): Promise<RefreshToken | null> {
    let current = spent;
    for (let hop = 0; hop < MAX_GRACE_HOPS; hop += 1) {
      if (!current.revokedAt) {
        return current;
      }
      if (!current.replacedByTokenId) {
        return null;
      }
      const next = await this.repository.findById(current.replacedByTokenId);
      if (!next || next.familyId !== spent.familyId) {
        return null;
      }
      const unclaimed = hop === 0 && current.presentedAt !== null && next.revokedAt === null;
      const rotatedLongAgo = now.getTime() - current.revokedAt.getTime() > ROTATION_GRACE_MS;
      if (rotatedLongAgo && !unclaimed) {
        return null;
      }
      current = next;
    }
    return null;
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
