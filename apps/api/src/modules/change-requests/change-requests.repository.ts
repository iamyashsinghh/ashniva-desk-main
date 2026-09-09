import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { ChangeRequestStatus, Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const changeRequestSummaryInclude = {
  clientOrganization: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, code: true, name: true } },
  contract: { select: { id: true, numberLabel: true, title: true } },
  requestedBy: userRef,
  createdBy: userRef,
  _count: { select: { tasks: { where: { deletedAt: null } } } },
} satisfies Prisma.ChangeRequestInclude;

export const changeRequestDetailInclude = {
  ...changeRequestSummaryInclude,
  comments: {
    where: { deletedAt: null },
    include: { author: userRef },
    orderBy: { createdAt: 'asc' },
  },
  files: {
    where: { deletedAt: null },
    include: { uploadedBy: userRef },
    orderBy: { createdAt: 'asc' },
  },
  tasks: {
    where: { deletedAt: null },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      project: { select: { code: true } },
    },
    orderBy: { number: 'asc' },
  },
  milestones: {
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  },
  history: { include: { changedBy: userRef }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ChangeRequestInclude;

export type ChangeRequestSummaryRow = Prisma.ChangeRequestGetPayload<{
  include: typeof changeRequestSummaryInclude;
}>;
export type ChangeRequestDetailRow = Prisma.ChangeRequestGetPayload<{
  include: typeof changeRequestDetailInclude;
}>;

export interface ChangeRequestListFilter {
  organizationId: string;
  clientOrganizationId?: string;
  requestedById?: string;
  /** Client reads: hide other people's drafts (a draft is only visible to the person writing it). */
  hideDraftsExcept?: string;
  status?: ChangeRequestStatus[];
  projectId?: string;
  contractId?: string;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface ChangeRequestPage {
  items: ChangeRequestSummaryRow[];
  nextCursor: string | null;
  total: number;
}

function buildWhere(filter: ChangeRequestListFilter): Prisma.ChangeRequestWhereInput {
  const search = filter.search?.trim();
  return {
    organizationId: filter.organizationId,
    deletedAt: null,
    ...(filter.clientOrganizationId ? { clientOrganizationId: filter.clientOrganizationId } : {}),
    ...(filter.requestedById ? { requestedById: filter.requestedById } : {}),
    ...(filter.status?.length ? { status: { in: filter.status } } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(filter.contractId ? { contractId: filter.contractId } : {}),
    AND: [
      ...(filter.hideDraftsExcept
        ? [
            {
              OR: [
                { status: { not: 'DRAFT' as const } },
                { requestedById: filter.hideDraftsExcept },
              ],
            },
          ]
        : []),
      ...(search
        ? [
            {
              OR: [
                { title: { contains: search, mode: 'insensitive' as const } },
                { description: { contains: search, mode: 'insensitive' as const } },
                ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
              ],
            },
          ]
        : []),
    ],
  };
}

/**
 * Change-request data access. organizationId is always the provider; client reads add
 * clientOrganizationId so one client never sees another client's requests.
 */
@Injectable()
export class ChangeRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ChangeRequestListFilter): Promise<ChangeRequestPage> {
    const where = buildWhere(filter);
    const [total, rows] = await Promise.all([
      this.prisma.changeRequest.count({ where }),
      this.prisma.changeRequest.findMany({
        where,
        include: changeRequestSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findDetail(
    organizationId: string,
    id: string,
    clientOrganizationId?: string,
  ): Promise<ChangeRequestDetailRow | null> {
    return this.prisma.changeRequest.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
        ...(clientOrganizationId ? { clientOrganizationId } : {}),
      },
      include: changeRequestDetailInclude,
    });
  }

  create(
    organizationId: string,
    data: Omit<Prisma.ChangeRequestUncheckedCreateInput, 'organizationId' | 'number'>,
    fileIds: string[] = [],
  ): Promise<ChangeRequestDetailRow> {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.organizationCounter.upsert({
        where: { organizationId_kind: { organizationId, kind: 'CHANGE_REQUEST' } },
        update: { value: { increment: 1 } },
        create: { organizationId, kind: 'CHANGE_REQUEST', value: 1 },
      });
      const row = await tx.changeRequest.create({
        data: {
          ...data,
          organizationId,
          number: counter.value,
          history: { create: { toStatus: 'DRAFT', changedById: data.createdById } },
        },
        include: changeRequestDetailInclude,
      });
      if (fileIds.length > 0) {
        // Only orphan files uploaded by the creator can be attached to a brand-new request.
        await tx.file.updateMany({
          where: {
            id: { in: fileIds },
            organizationId,
            uploadedById: data.createdById,
            changeRequestId: null,
            taskId: null,
            ticketId: null,
            deletedAt: null,
          },
          data: { changeRequestId: row.id },
        });
      }
      return row;
    });
  }

  update(id: string, data: Prisma.ChangeRequestUncheckedUpdateInput) {
    return this.prisma.changeRequest.update({
      where: { id },
      data,
      include: changeRequestDetailInclude,
    });
  }

  transition(
    id: string,
    from: ChangeRequestStatus,
    to: ChangeRequestStatus,
    changedById: string,
    note: string | null,
    data: Prisma.ChangeRequestUncheckedUpdateInput = {},
  ): Promise<ChangeRequestDetailRow> {
    return this.prisma.changeRequest.update({
      where: { id },
      data: {
        ...data,
        status: to,
        history: { create: { fromStatus: from, toStatus: to, changedById, note } },
      },
      include: changeRequestDetailInclude,
    });
  }
}
