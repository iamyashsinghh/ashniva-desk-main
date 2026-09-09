import { Injectable } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS, OPEN_CHANGE_REQUEST_STATUSES } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type {
  ContractStatus,
  ContractType,
  Prisma,
  PrismaClient,
} from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const contractSummaryInclude = {
  clientOrganization: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, code: true, name: true } },
  createdBy: userRef,
  _count: {
    select: {
      changeRequests: {
        where: { status: { in: [...OPEN_CHANGE_REQUEST_STATUSES] }, deletedAt: null },
      },
    },
  },
} satisfies Prisma.ContractInclude;

export const contractDetailInclude = {
  ...contractSummaryInclude,
  paymentMilestones: {
    where: { deletedAt: null },
    include: { milestone: { select: { id: true, name: true } } },
    orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }],
  },
  documents: {
    where: { deletedAt: null },
    include: { uploadedBy: userRef },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ContractInclude;

export type ContractSummaryRow = Prisma.ContractGetPayload<{
  include: typeof contractSummaryInclude;
}>;
export type ContractDetailRow = Prisma.ContractGetPayload<{
  include: typeof contractDetailInclude;
}>;

export const ledgerInclude = {
  createdBy: userRef,
  ticket: { select: { id: true, number: true, title: true } },
  workLog: {
    select: {
      task: {
        select: { id: true, number: true, title: true, project: { select: { code: true } } },
      },
    },
  },
} satisfies Prisma.ContractHourLedgerInclude;

export type LedgerRow = Prisma.ContractHourLedgerGetPayload<{ include: typeof ledgerInclude }>;

export interface ContractListFilter {
  organizationId: string;
  clientOrganizationId?: string;
  projectId?: string;
  status?: ContractStatus[];
  type?: ContractType;
  search?: string;
  endingBefore?: Date;
  /** Lower bound on the end date, so "expiring soon" excludes contracts already past. */
  endingAfter?: Date;
  limit: number;
  cursor?: string;
}

export type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class ContractsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: ContractListFilter,
  ): Promise<{ items: ContractSummaryRow[]; nextCursor: string | null; total: number }> {
    const search = filter.search?.trim();
    const where: Prisma.ContractWhereInput = {
      organizationId: filter.organizationId,
      deletedAt: null,
      ...(filter.clientOrganizationId ? { clientOrganizationId: filter.clientOrganizationId } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.status ? { status: { in: filter.status } } : {}),
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.endingBefore || filter.endingAfter
        ? { endDate: { gte: filter.endingAfter, lte: filter.endingBefore } }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { numberLabel: { contains: search, mode: 'insensitive' } },
              { clientOrganization: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        include: contractSummaryInclude,
        orderBy: [{ status: 'asc' }, { endDate: 'asc' }, { createdAt: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const items = rows.slice(0, filter.limit);
    return {
      items,
      nextCursor: rows.length > filter.limit ? (items.at(-1)?.id ?? null) : null,
      total,
    };
  }

  findSummary(organizationId: string, id: string): Promise<ContractSummaryRow | null> {
    return this.prisma.contract.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: contractSummaryInclude,
    });
  }

  findDetail(organizationId: string, id: string): Promise<ContractDetailRow | null> {
    return this.prisma.contract.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: contractDetailInclude,
    });
  }

  /** Portal access: the client organization's own contracts only. */
  findForClient(clientOrganizationId: string, id: string): Promise<ContractDetailRow | null> {
    return this.prisma.contract.findFirst({
      where: { id, clientOrganizationId, deletedAt: null, status: { not: 'DRAFT' } },
      include: contractDetailInclude,
    });
  }

  listForClient(clientOrganizationId: string): Promise<ContractSummaryRow[]> {
    return this.prisma.contract.findMany({
      where: { clientOrganizationId, deletedAt: null, status: { not: 'DRAFT' } },
      include: contractSummaryInclude,
      orderBy: [{ status: 'asc' }, { endDate: 'asc' }],
      take: MAX_UNPAGINATED_ITEMS,
    });
  }

  /** Creates the contract under a fresh per-organization number, e.g. CT-2026-0007. */
  create(
    organizationId: string,
    data: Omit<Prisma.ContractUncheckedCreateInput, 'organizationId' | 'number' | 'numberLabel'>,
  ): Promise<ContractDetailRow> {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.organizationCounter.upsert({
        where: { organizationId_kind: { organizationId, kind: 'CONTRACT' } },
        update: { value: { increment: 1 } },
        create: { organizationId, kind: 'CONTRACT', value: 1 },
      });
      const year = new Date(data.startDate).getUTCFullYear();
      return tx.contract.create({
        data: {
          ...data,
          organizationId,
          number: counter.value,
          numberLabel: `CT-${year}-${String(counter.value).padStart(4, '0')}`,
        },
        include: contractDetailInclude,
      });
    });
  }

  update(id: string, data: Prisma.ContractUncheckedUpdateInput): Promise<ContractDetailRow> {
    return this.prisma.contract.update({ where: { id }, data, include: contractDetailInclude });
  }

  /** Active contracts that track hours for a project, then for the client organization at large. */
  async findHourContractForProject(
    organizationId: string,
    projectId: string,
    clientOrganizationId: string,
    on: Date,
  ) {
    const dateFilter = {
      startDate: { lte: on },
      OR: [{ endDate: null }, { endDate: { gte: on } }],
    };
    const candidates = await this.prisma.contract.findMany({
      where: {
        organizationId,
        clientOrganizationId,
        status: 'ACTIVE',
        deletedAt: null,
        ...dateFilter,
        OR: [{ projectId }, { projectId: null }],
      },
      orderBy: [{ projectId: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    return (
      candidates.find((row) => row.includedMinutesPerPeriod > 0 || row.type === 'SUPPORT_HOURS') ??
      null
    );
  }

  listLedger(
    contractId: string,
    options: { limit: number; cursor?: string; periodStart?: Date },
  ): Promise<LedgerRow[]> {
    return this.prisma.contractHourLedger.findMany({
      where: {
        contractId,
        ...(options.periodStart ? { periodStart: options.periodStart } : {}),
      },
      include: ledgerInclude,
      orderBy: { createdAt: 'desc' },
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
  }

  listActiveHourContracts(on: Date) {
    return this.prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        startDate: { lte: on },
        OR: [{ includedMinutesPerPeriod: { gt: 0 } }, { type: 'SUPPORT_HOURS' }],
      },
    });
  }

  listExpiring(on: Date, withinDays: number) {
    const until = new Date(on.getTime() + withinDays * 86_400_000);
    return this.prisma.contract.findMany({
      where: { status: 'ACTIVE', deletedAt: null, endDate: { gte: on, lte: until } },
      include: contractSummaryInclude,
    });
  }

  listExpired(on: Date) {
    return this.prisma.contract.findMany({
      where: { status: 'ACTIVE', deletedAt: null, endDate: { lt: on } },
      include: contractSummaryInclude,
    });
  }
}
