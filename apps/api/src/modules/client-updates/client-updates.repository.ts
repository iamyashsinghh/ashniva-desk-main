import { Injectable } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { ClientUpdateStatus, Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

const clientUpdateInclude = {
  author: userRef,
  publishedBy: userRef,
  project: { select: { id: true, code: true, name: true } },
  clientOrganization: { select: { id: true, name: true, slug: true } },
  task: { select: { id: true, number: true, title: true, project: { select: { code: true } } } },
  ticket: { select: { id: true, number: true, title: true } },
} satisfies Prisma.ClientUpdateInclude;

export type ClientUpdateRow = Prisma.ClientUpdateGetPayload<{
  include: typeof clientUpdateInclude;
}>;

export interface ClientUpdateFilter {
  organizationId: string;
  /**
   * The caller's task scope, from `TaskVisibilityService.clientUpdateWhere`. Undefined means the
   * caller reads the whole tenant, which is what an organization-wide reader gets — not what an
   * omitted scope means, so callers acting for a person always pass it.
   */
  visibility?: Prisma.ClientUpdateWhereInput;
  clientOrganizationId?: string;
  projectId?: string;
  status?: ClientUpdateStatus[];
  workDateFrom?: Date;
  workDateTo?: Date;
  /** Filter by the date the update was published (portal "completed today"). */
  publishedFrom?: Date;
  publishedTo?: Date;
  limit?: number;
}

export interface CreateClientUpdateInput {
  organizationId: string;
  clientOrganizationId: string;
  projectId: string;
  taskId?: string;
  ticketId?: string;
  workDate: Date;
  title: string;
  body: string;
  authorId: string;
}

@Injectable()
export class ClientUpdatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    input: CreateClientUpdateInput,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ClientUpdateRow> {
    return tx.clientUpdate.create({ data: input, include: clientUpdateInclude });
  }

  list(filter: ClientUpdateFilter): Promise<ClientUpdateRow[]> {
    return this.prisma.clientUpdate.findMany({
      where: {
        ...(filter.visibility ? { AND: filter.visibility } : {}),
        organizationId: filter.organizationId,
        ...(filter.clientOrganizationId
          ? { clientOrganizationId: filter.clientOrganizationId }
          : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
        ...(filter.status?.length ? { status: { in: filter.status } } : {}),
        ...(filter.workDateFrom || filter.workDateTo
          ? { workDate: { gte: filter.workDateFrom, lte: filter.workDateTo } }
          : {}),
        ...(filter.publishedFrom || filter.publishedTo
          ? { publishedAt: { gte: filter.publishedFrom, lt: filter.publishedTo } }
          : {}),
      },
      include: clientUpdateInclude,
      orderBy: [{ workDate: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(filter.limit ?? MAX_UNPAGINATED_ITEMS, MAX_UNPAGINATED_ITEMS),
    });
  }

  findById(
    organizationId: string,
    id: string,
    visibility?: Prisma.ClientUpdateWhereInput,
  ): Promise<ClientUpdateRow | null> {
    return this.prisma.clientUpdate.findFirst({
      where: { id, organizationId, ...(visibility ? { AND: visibility } : {}) },
      include: clientUpdateInclude,
    });
  }

  update(id: string, data: Prisma.ClientUpdateUncheckedUpdateInput): Promise<ClientUpdateRow> {
    return this.prisma.clientUpdate.update({ where: { id }, data, include: clientUpdateInclude });
  }

  countPending(organizationId: string): Promise<number> {
    return this.prisma.clientUpdate.count({ where: { organizationId, status: 'PENDING' } });
  }
}
