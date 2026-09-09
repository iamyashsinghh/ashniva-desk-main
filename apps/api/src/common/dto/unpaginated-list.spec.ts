import { Logger } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import { ClientUpdatesRepository } from '../../modules/client-updates/client-updates.repository';
import { ContractsRepository } from '../../modules/contracts/contracts.repository';
import { ProductsRepository } from '../../modules/products/products.repository';
import { UsersRepository } from '../../modules/users/users.repository';
import { WorkLogsRepository } from '../../modules/work-logs/work-logs.repository';
import { boundedList } from './unpaginated-list';

interface Recorded {
  take?: number;
}

/**
 * A Prisma stand-in that records the arguments of whichever delegate is asked for and answers
 * with an empty page, so a repository's `take` can be asserted without a database.
 */
function recorder() {
  const calls: Recorded[] = [];
  const delegate = {
    findMany: (args: Recorded) => {
      calls.push(args);
      return Promise.resolve([]);
    },
  };
  const prisma = new Proxy({}, { get: () => delegate });
  return { prisma: prisma as unknown as PrismaService, calls };
}

/**
 * The bound belongs to a family of endpoints rather than to any one of them, so the test that
 * every member carries it lives with the helper that defines the family.
 */
describe('lists that are returned whole', () => {
  it('bounds every list that returns a bare array', async () => {
    const cases: Array<[string, () => Promise<unknown>, Recorded[]]> = [];

    const products = recorder();
    cases.push([
      'GET /products',
      () => new ProductsRepository(products.prisma).list('org'),
      products.calls,
    ]);

    const users = recorder();
    cases.push([
      'GET /users and /users/directory',
      () => new UsersRepository(users.prisma).listMemberships({ organizationId: 'org' }),
      users.calls,
    ]);

    const contracts = recorder();
    cases.push([
      'GET /portal/contracts',
      () => new ContractsRepository(contracts.prisma).listForClient('client'),
      contracts.calls,
    ]);

    const updates = recorder();
    cases.push([
      'GET /client-updates and /portal/updates',
      () => new ClientUpdatesRepository(updates.prisma).list({ organizationId: 'org' }),
      updates.calls,
    ]);

    const workLogs = recorder();
    cases.push([
      'GET /work-logs',
      () => new WorkLogsRepository(workLogs.prisma).list({ organizationId: 'org' }),
      workLogs.calls,
    ]);

    for (const [name, run, calls] of cases) {
      await run();
      expect([name, calls[0]?.take]).toEqual([name, MAX_UNPAGINATED_ITEMS]);
    }
  });

  it('never lets a caller ask a bounded list for more than the bound', async () => {
    const updates = recorder();
    await new ClientUpdatesRepository(updates.prisma).list({
      organizationId: 'org',
      limit: 10_000,
    });
    expect(updates.calls[0]?.take).toBe(MAX_UNPAGINATED_ITEMS);
  });

  it('still honours a smaller limit a caller asks for', async () => {
    const updates = recorder();
    await new ClientUpdatesRepository(updates.prisma).list({ organizationId: 'org', limit: 10 });
    expect(updates.calls[0]?.take).toBe(10);
  });

  it('says so when a list comes back at the bound, and stays quiet otherwise', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const short = boundedList('GET /products', [1, 2, 3]);
      expect(short).toEqual([1, 2, 3]);
      expect(warn).not.toHaveBeenCalled();

      const full = Array.from({ length: MAX_UNPAGINATED_ITEMS }, (_, index) => index);
      expect(boundedList('GET /products', full)).toHaveLength(MAX_UNPAGINATED_ITEMS);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('GET /products');
    } finally {
      warn.mockRestore();
    }
  });
});
