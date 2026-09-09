import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, ReleaseStatus } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true } } as const;

export const releaseSummaryInclude = {
  project: { select: { id: true, code: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.ReleaseInclude;

export const releaseDetailInclude = {
  ...releaseSummaryInclude,
  items: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: {
      task: {
        select: { id: true, number: true, title: true, project: { select: { code: true } } },
      },
      ticket: { select: { id: true, number: true, title: true } },
      changeRequest: { select: { id: true, number: true, title: true } },
    },
  },
  approvals: { include: { approver: userRef }, orderBy: { createdAt: 'asc' } },
  history: { include: { changedBy: userRef }, orderBy: { createdAt: 'asc' } },
  publishedBy: userRef,
} satisfies Prisma.ReleaseInclude;

export type ReleaseSummaryRow = Prisma.ReleaseGetPayload<{ include: typeof releaseSummaryInclude }>;
export type ReleaseDetailRow = Prisma.ReleaseGetPayload<{ include: typeof releaseDetailInclude }>;

export interface ReleaseListFilter {
  organizationId: string;
  projectId?: string;
  status?: ReleaseStatus[];
  search?: string;
  limit: number;
  cursor?: string;
}

export interface ReleasePage {
  items: ReleaseSummaryRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * Release data access. Every query names `organizationId`, including the writes: a scoped read
 * followed by an unscoped `update` by id is one refactor away from writing across tenants.
 *
 * Items, approvals and history rows are reached only through a release the caller has already
 * been scoped to, which is why the child tables are addressed by `releaseId` here.
 */
@Injectable()
export class ReleasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ReleaseListFilter): Promise<ReleasePage> {
    const search = filter.search?.trim();
    const where: Prisma.ReleaseWhereInput = {
      organizationId: filter.organizationId,
      deletedAt: null,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(search
        ? {
            OR: [
              { version: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.release.count({ where }),
      this.prisma.release.findMany({
        where,
        include: releaseSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findDetail(organizationId: string, id: string): Promise<ReleaseDetailRow | null> {
    return this.prisma.release.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: releaseDetailInclude,
    });
  }

  /** The first history row is written here so a release can never exist without a trail. */
  create(
    organizationId: string,
    data: Omit<Prisma.ReleaseUncheckedCreateInput, 'organizationId'>,
  ): Promise<ReleaseDetailRow> {
    return this.prisma.release.create({
      data: {
        ...data,
        organizationId,
        history: { create: { toStatus: 'DRAFT', changedById: data.createdById } },
      },
      include: releaseDetailInclude,
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: Prisma.ReleaseUncheckedUpdateInput,
  ): Promise<void> {
    await this.prisma.release.updateMany({ where: { id, organizationId, deletedAt: null }, data });
  }

  /**
   * Moves the status, conditional on it still being what the caller checked, and writes the
   * history row in the same transaction.
   *
   * `updateMany` rather than read-then-`update`: the workflow check ran against a row read a
   * moment ago, so two operators pressing Publish at the same time both reach here. Matching on
   * the expected status means the second one matches nothing and is told so, instead of
   * overwriting the first one's claim. `count === 0` is the caller's 409.
   */
  async transition(input: {
    organizationId: string;
    id: string;
    from: ReleaseStatus;
    to: ReleaseStatus;
    changedById: string;
    note: string | null;
    data?: Prisma.ReleaseUncheckedUpdateInput;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.release.updateMany({
        where: {
          id: input.id,
          organizationId: input.organizationId,
          status: input.from,
          deletedAt: null,
        },
        data: { ...input.data, status: input.to },
      });
      if (claimed.count === 0) {
        return false;
      }
      await tx.releaseHistory.create({
        data: {
          releaseId: input.id,
          fromStatus: input.from,
          toStatus: input.to,
          note: input.note,
          changedById: input.changedById,
        },
      });
      return true;
    });
  }

  /** Appended at the end of the list; `position` is what the release page orders by. */
  async addItem(
    releaseId: string,
    data: Omit<Prisma.ReleaseItemUncheckedCreateInput, 'releaseId' | 'position'>,
  ): Promise<void> {
    const last = await this.prisma.releaseItem.findFirst({
      where: { releaseId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    await this.prisma.releaseItem.create({
      data: { ...data, releaseId, position: (last?.position ?? -1) + 1 },
    });
  }

  async removeItem(releaseId: string, itemId: string): Promise<number> {
    const removed = await this.prisma.releaseItem.deleteMany({ where: { id: itemId, releaseId } });
    return removed.count;
  }

  /**
   * Resolves what an item points at, scoped to the provider and to the release's own project.
   *
   * A release that could carry another project's task would carry another client's work to
   * production, so the project match is part of the lookup rather than a check afterwards.
   */
  async findItemTarget(
    organizationId: string,
    projectId: string,
    ids: { taskId?: string; ticketId?: string; changeRequestId?: string },
  ): Promise<{ id: string } | null> {
    if (ids.taskId) {
      return this.prisma.task.findFirst({
        where: { id: ids.taskId, organizationId, projectId, deletedAt: null },
        select: { id: true },
      });
    }
    if (ids.ticketId) {
      return this.prisma.ticket.findFirst({
        where: { id: ids.ticketId, organizationId, projectId, deletedAt: null },
        select: { id: true },
      });
    }
    if (ids.changeRequestId) {
      // A change request may sit outside any project; one that names a project must name this one.
      return this.prisma.changeRequest.findFirst({
        where: {
          id: ids.changeRequestId,
          organizationId,
          deletedAt: null,
          OR: [{ projectId }, { projectId: null }],
        },
        select: { id: true },
      });
    }
    return null;
  }

  /**
   * A version already used on this project. The unique index is the real guard; this exists so
   * the operator is told "2026.09.1 already exists" instead of a generic conflict.
   */
  findByVersion(
    organizationId: string,
    projectId: string,
    version: string,
  ): Promise<{ id: string } | null> {
    return this.prisma.release.findFirst({
      where: { organizationId, projectId, version },
      select: { id: true },
    });
  }

  findProject(organizationId: string, projectId: string): Promise<{ id: string } | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true },
    });
  }
}
