import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/** The ticket column each grouping counts by. */
export type RecurringGroupField = 'productId' | 'module' | 'productVersion' | 'priority';

export interface RecurringFilter {
  organizationId: string;
  projectId?: string;
  since: Date;
}

/**
 * The recurring-issues dashboard, in two `groupBy` queries and no per-row work.
 *
 * Two rather than one because PostgreSQL cannot count distinct client organizations inside the
 * same aggregate that counts tickets, and Prisma's `groupBy` has no `count(distinct)` at all. The
 * shape that follows — group, and group-by-pair — is still two index scans whatever the size of
 * the table, where a row-by-row count would be one query per group.
 */
@Injectable()
export class RecurringReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tickets worth grouping: inside the report window, and not cancelled.
   *
   * Cancelled tickets are left out for the same reason they are left out of the candidate query:
   * a duplicate somebody already cancelled is not evidence that a fault keeps happening.
   *
   * The window is not optional. A report headed "last 7 days" that counted every ticket ever
   * raised would call three clients who each reported the same module in a different year a
   * recurring issue — and `productVersion` is free text a client types or a machine integration
   * posts, so counting all of history also means one group per build hash on a busy integration.
   */
  private where(filter: RecurringFilter): Prisma.TicketWhereInput {
    return {
      organizationId: filter.organizationId,
      deletedAt: null,
      status: { not: 'CANCELLED' },
      createdAt: { gte: filter.since },
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
    };
  }

  /** How many tickets fall in each group. */
  countByGroup(field: RecurringGroupField, filter: RecurringFilter) {
    return this.prisma.ticket.groupBy({
      by: [field],
      where: this.where(filter),
      _count: { _all: true },
    });
  }

  /** One row per (group, client), which is what makes the distinct client count a length. */
  countByGroupAndClient(field: RecurringGroupField, filter: RecurringFilter) {
    return this.prisma.ticket.groupBy({
      by: [field, 'clientOrganizationId'],
      where: this.where(filter),
      _count: { _all: true },
    });
  }

  /** Product names for the product grouping, so a row reads as a name rather than an id. */
  findProducts(organizationId: string) {
    return this.prisma.product.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, name: true },
    });
  }
}
