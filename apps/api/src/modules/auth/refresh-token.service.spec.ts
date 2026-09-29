import { UnauthorizedException } from '@nestjs/common';

import type { AppConfigService } from '../../config/app-config.service';
import type { RefreshToken } from '../../generated/prisma/client';
import type { CreateRefreshTokenInput, RefreshTokenRepository } from './refresh-token.repository';
import { ROTATION_GRACE_MS, RefreshTokenService } from './refresh-token.service';

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
      presentedAt: null,
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
  async findById(id: string) {
    return this.rows.find((row) => row.id === id) ?? null;
  }
  async markReplaced(id: string, replacedByTokenId: string, revokedAt: Date, presented: boolean) {
    const row = this.rows.find((r) => r.id === id);
    if (row) {
      Object.assign(row, {
        revokedAt,
        replacedByTokenId,
        ...(presented ? { presentedAt: revokedAt } : {}),
      });
    }
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

  describe('reuse of a rotated token', () => {
    afterEach(() => jest.useRealTimers());

    const live = (repository: FakeRefreshTokenRepository) =>
      repository.rows.filter((row) => row.revokedAt === null);

    it('revokes the whole family once the grace period has passed and the replacement was used', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-28T10:00:00Z') });
      const { service, repository } = buildService();
      const first = await service.issue('user-1');
      const second = await service.rotate(first.token);
      await service.rotate(second.token);

      jest.setSystemTime(new Date(Date.now() + ROTATION_GRACE_MS + 1));
      await expect(service.rotate(first.token)).rejects.toThrow(/already used/);
      expect(live(repository)).toHaveLength(0);
    });

    it('accepts a retry long after the rotation while its replacement was never claimed', async () => {
      // The refresh committed but its reply never arrived (a timeout, a 500 while building the
      // session), and the app is opened again hours later with the token it still holds.
      jest.useFakeTimers({ now: new Date('2026-09-28T10:00:00Z') });
      const { service, repository } = buildService(24 * 60 * 60);
      const first = await service.issue('user-1');
      await service.rotate(first.token);

      jest.setSystemTime(new Date(Date.now() + 6 * 60 * 60 * 1000));
      const retried = await service.rotate(first.token);

      expect(retried.familyId).toBe(first.familyId);
      expect(live(repository)).toHaveLength(1);
    });

    it('catches a replay of the old token once the real device uses its replacement', async () => {
      // A thief replays `first` after the real device received `second` but before it used it.
      jest.useFakeTimers({ now: new Date('2026-09-28T10:00:00Z') });
      const { service, repository } = buildService();
      const first = await service.issue('user-1');
      const second = await service.rotate(first.token);

      jest.setSystemTime(new Date(Date.now() + ROTATION_GRACE_MS + 1));
      const stolen = await service.rotate(first.token);

      jest.setSystemTime(new Date(Date.now() + ROTATION_GRACE_MS + 1));
      await expect(service.rotate(second.token)).rejects.toThrow(/already used/);
      await expect(service.rotate(stolen.token)).rejects.toThrow(UnauthorizedException);
      expect(live(repository)).toHaveLength(0);
    });

    it('treats a reply lost inside the grace period as a retry, not theft', async () => {
      // An app reloaded while its refresh was in flight: the server rotated, the client never
      // heard, and it presents the token it still has.
      const { service, repository } = buildService();
      const first = await service.issue('user-1');
      await service.rotate(first.token);

      const retried = await service.rotate(first.token);

      expect(retried.familyId).toBe(first.familyId);
      // Still exactly one live token: the one just handed out.
      expect(live(repository)).toHaveLength(1);
      expect(live(repository)[0]?.tokenHash).not.toBe(repository.rows[1]?.tokenHash);
      await expect(service.rotate(retried.token)).resolves.toMatchObject({ userId: 'user-1' });
    });

    it('follows several lost replies to the live end of the chain', async () => {
      const { service, repository } = buildService();
      const first = await service.issue('user-1');
      const second = await service.rotate(first.token);
      await service.rotate(second.token);

      await expect(service.rotate(first.token)).resolves.toMatchObject({ userId: 'user-1' });
      expect(live(repository)).toHaveLength(1);
    });

    it('never revives a session that was signed out, however recently', async () => {
      const { service, repository } = buildService();
      const first = await service.issue('user-1');
      const second = await service.rotate(first.token);
      await service.revoke(second.token);

      await expect(service.rotate(first.token)).rejects.toThrow(UnauthorizedException);
      expect(live(repository)).toHaveLength(0);
    });

    it('never revives a family already revoked for theft', async () => {
      const { service, repository } = buildService();
      const first = await service.issue('user-1');
      await service.rotate(first.token);
      await service.revokeAllForUser('user-1');

      await expect(service.rotate(first.token)).rejects.toThrow(UnauthorizedException);
      expect(live(repository)).toHaveLength(0);
    });
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
