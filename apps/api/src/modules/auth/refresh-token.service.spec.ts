import { UnauthorizedException } from '@nestjs/common';

import type { AppConfigService } from '../../config/app-config.service';
import type { RefreshToken } from '../../generated/prisma/client';
import type { CreateRefreshTokenInput, RefreshTokenRepository } from './refresh-token.repository';
import { RefreshTokenService } from './refresh-token.service';

/** In-memory stand-in for the Prisma-backed repository. */
class FakeRefreshTokenRepository {
  rows: RefreshToken[] = [];
  private counter = 0;

  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    const row: RefreshToken = {
      id: `token-${++this.counter}`,
      userId: input.userId,
      organizationId: input.organizationId,
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      expiresAt: input.expiresAt,
      revokedAt: null,
      replacedByTokenId: null,
      userAgent: input.userAgent ?? null,
      ipAddress: input.ipAddress ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }
  async findByHash(tokenHash: string) {
    return this.rows.find((row) => row.tokenHash === tokenHash) ?? null;
  }
  async markReplaced(id: string, replacedByTokenId: string, revokedAt: Date) {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, { revokedAt, replacedByTokenId });
  }
  async revokeById(id: string, revokedAt: Date) {
    const row = this.rows.find((r) => r.id === id && !r.revokedAt);
    if (row) row.revokedAt = revokedAt;
  }
  async revokeFamily(familyId: string, revokedAt: Date) {
    this.rows
      .filter((r) => r.familyId === familyId && !r.revokedAt)
      .forEach((r) => (r.revokedAt = revokedAt));
  }
  async revokeAllForUser(userId: string, revokedAt: Date) {
    this.rows
      .filter((r) => r.userId === userId && !r.revokedAt)
      .forEach((r) => (r.revokedAt = revokedAt));
  }
}

function buildService(refreshTtlSeconds = 3600) {
  const repository = new FakeRefreshTokenRepository();
  const config = { jwt: { refreshTtlSeconds } } as unknown as AppConfigService;
  const service = new RefreshTokenService(repository as unknown as RefreshTokenRepository, config);
  return { service, repository };
}

describe('RefreshTokenService', () => {
  it('stores only a hash of the issued token', async () => {
    const { service, repository } = buildService();
    const issued = await service.issue('user-1');
    expect(repository.rows[0]?.tokenHash).not.toBe(issued.token);
    expect(repository.rows[0]?.tokenHash).toHaveLength(64);
  });

  it('rotates a token and keeps the family', async () => {
    const { service, repository } = buildService();
    const first = await service.issue('user-1');
    const second = await service.rotate(first.token);

    expect(second.userId).toBe('user-1');
    expect(second.familyId).toBe(first.familyId);
    expect(second.token).not.toBe(first.token);
    expect(repository.rows[0]?.revokedAt).not.toBeNull();
    expect(repository.rows[0]?.replacedByTokenId).toBe('token-2');
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const { service, repository } = buildService();
    const first = await service.issue('user-1');
    await service.rotate(first.token);

    await expect(service.rotate(first.token)).rejects.toThrow(UnauthorizedException);
    expect(repository.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });

  it('rejects expired tokens', async () => {
    const { service } = buildService(-10);
    const issued = await service.issue('user-1');
    await expect(service.rotate(issued.token)).rejects.toThrow(/expired/);
  });

  it('rejects unknown tokens', async () => {
    const { service } = buildService();
    await expect(service.rotate('nope')).rejects.toThrow(/not valid/);
  });

  it('revokes all tokens for a user (remote logout)', async () => {
    const { service, repository } = buildService();
    await service.issue('user-1');
    await service.issue('user-1');
    await service.revokeAllForUser('user-1');
    expect(repository.rows.every((row) => row.revokedAt !== null)).toBe(true);
  });
});
