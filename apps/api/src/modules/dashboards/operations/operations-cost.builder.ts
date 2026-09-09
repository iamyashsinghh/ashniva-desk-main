import { CONTRACT_STATUS, type OperationsCost } from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { OperationsFilters } from './operations-filters';

/**
 * What the active contracts behind these projects are worth, and what they are costing us.
 *
 * Guarded by `cost:read` at the caller: `internalCost` is the number the contracts module already
 * refuses to show anybody else, and a dashboard is not a way around a permission.
 *
 * One grouped query, keyed by currency — a single total across currencies would be arithmetic on
 * incomparable units.
 */
export async function buildOperationsCost(
  prisma: PrismaService,
  organizationId: string,
  filters: OperationsFilters,
): Promise<OperationsCost[]> {
  const rows = await prisma.contract.groupBy({
    by: ['currency'],
    where: {
      organizationId,
      deletedAt: null,
      status: CONTRACT_STATUS.ACTIVE,
      ...(filters.organizationWide ? {} : { projectId: { in: filters.projectIds } }),
    },
    _sum: { contractValue: true, internalCost: true },
    _count: { _all: true },
    orderBy: { currency: 'asc' },
  });
  return rows.map((row) => ({
    currency: row.currency,
    contracts: row._count._all,
    contractValue: row._sum.contractValue?.toString() ?? '0',
    internalCost: row._sum.internalCost?.toString() ?? '0',
  }));
}
