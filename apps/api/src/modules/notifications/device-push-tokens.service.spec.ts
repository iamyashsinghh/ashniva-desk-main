import type { AuthenticatedUser } from '@ashniva/types';

import type { TenantContextService } from '../../common/tenant/tenant-context.service';
import type { DevicePushTokensRepository } from './device-push-tokens.repository';
import { DevicePushTokensService } from './device-push-tokens.service';

const TOKEN = 'ExponentPushToken[phone-1]';

interface Row {
  organizationId: string;
  userId: string;
  token: string;
  platform: string;
  lastSeenAt: Date;
}

/** An in-memory stand-in with the one rule the real table enforces: the token is unique. */
function repositoryDouble(rows: Row[]) {
  return {
    upsert: jest.fn(async (input: Row) => {
      const existing = rows.find((row) => row.token === input.token);
      if (existing) {
        Object.assign(existing, input);
      } else {
        rows.push({ ...input });
      }
    }),
    deleteOwned: jest.fn(async (organizationId: string, userId: string, token: string) => {
      const index = rows.findIndex(
        (row) =>
          row.token === token && row.userId === userId && row.organizationId === organizationId,
      );
      if (index === -1) {
        return 0;
      }
      rows.splice(index, 1);
      return 1;
    }),
    tokensFor: jest.fn(async () => rows.map((row) => row.token)),
    deleteTokens: jest.fn(async () => 0),
  };
}

function build(rows: Row[] = []) {
  const repository = repositoryDouble(rows);
  const tenantContext = {
    runAsSystem: jest.fn(<T>(run: () => Promise<T>) => run()),
  };
  const service = new DevicePushTokensService(
    repository as unknown as DevicePushTokensRepository,
    tenantContext as unknown as TenantContextService,
  );
  return { service, repository, tenantContext, rows };
}

function actor(userId: string, organizationId: string): AuthenticatedUser {
  return { userId, organizationId } as AuthenticatedUser;
}

describe('DevicePushTokensService', () => {
  it('re-binds a token to whoever signs in on the phone next, and refreshes lastSeenAt', async () => {
    const { service, rows, tenantContext } = build();
    const first = new Date('2026-09-01T00:00:00Z');
    const later = new Date('2026-09-02T00:00:00Z');

    await service.register(actor('asha', 'org-a'), { token: TOKEN, platform: 'IOS' }, first);
    await service.register(actor('ravi', 'org-b'), { token: TOKEN, platform: 'IOS' }, later);

    expect(rows).toEqual([
      { organizationId: 'org-b', userId: 'ravi', token: TOKEN, platform: 'IOS', lastSeenAt: later },
    ]);
    // The previous owner may be in another tenant, which row-level security would hide.
    expect(tenantContext.runAsSystem).toHaveBeenCalledTimes(2);
  });

  it('forgets a token only for the person who owns it', async () => {
    const { service, rows } = build([
      {
        organizationId: 'org-a',
        userId: 'asha',
        token: TOKEN,
        platform: 'ANDROID',
        lastSeenAt: new Date(),
      },
    ]);

    await service.unregister(actor('ravi', 'org-a'), TOKEN);
    expect(rows).toHaveLength(1);

    await service.unregister(actor('asha', 'org-b'), TOKEN);
    expect(rows).toHaveLength(1);

    await service.unregister(actor('asha', 'org-a'), TOKEN);
    expect(rows).toEqual([]);
  });

  it('skips the database for empty recipient and removal lists', async () => {
    const { service, repository } = build();

    await expect(service.tokensFor('org-a', [])).resolves.toEqual([]);
    await service.remove([]);

    expect(repository.tokensFor).not.toHaveBeenCalled();
    expect(repository.deleteTokens).not.toHaveBeenCalled();
  });
});
