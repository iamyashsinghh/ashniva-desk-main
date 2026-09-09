import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { ApprovalStatus, Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const approvalSummaryInclude = {
  clientOrganization: { select: { id: true, name: true, slug: true } },
  project: { select: { id: true, code: true, name: true } },
  contract: { select: { id: true, numberLabel: true, title: true } },
  changeRequest: { select: { id: true, number: true, title: true } },
  requestedBy: userRef,
  decidedBy: userRef,
} satisfies Prisma.ApprovalRequestInclude;

export const approvalDetailInclude = {
  ...approvalSummaryInclude,
  internalReviewer: userRef,
  publishedBy: userRef,
  files: {
    where: { deletedAt: null },
    include: { uploadedBy: userRef },
    orderBy: { createdAt: 'asc' },
  },
  history: { include: { actor: userRef }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ApprovalRequestInclude;

export type ApprovalSummaryRow = Prisma.ApprovalRequestGetPayload<{
  include: typeof approvalSummaryInclude;
}>;
export type ApprovalDetailRow = Prisma.ApprovalRequestGetPayload<{
  include: typeof approvalDetailInclude;
}>;

export interface ApprovalListFilter {
  organizationId: string;
  clientOrganizationId?: string;
  status?: ApprovalStatus[];
  requestedById?: string;
  subjectType?: Prisma.ApprovalRequestWhereInput['subjectType'];
  projectId?: string;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface ApprovalPage {
  items: ApprovalSummaryRow[];
  nextCursor: string | null;
  total: number;
}

function buildWhere(filter: ApprovalListFilter): Prisma.ApprovalRequestWhereInput {
  const search = filter.search?.trim();
  return {
    organizationId: filter.organizationId,
    deletedAt: null,
    ...(filter.clientOrganizationId ? { clientOrganizationId: filter.clientOrganizationId } : {}),
    ...(filter.status?.length ? { status: { in: filter.status } } : {}),
    ...(filter.requestedById ? { requestedById: filter.requestedById } : {}),
    ...(filter.subjectType ? { subjectType: filter.subjectType } : {}),
    ...(filter.projectId ? { projectId: filter.projectId } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { summary: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

/** Approval requests: provider rows, optionally narrowed to one client organization. */
@Injectable()
export class ApprovalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ApprovalListFilter): Promise<ApprovalPage> {
    const where = buildWhere(filter);
    const [total, rows] = await Promise.all([
      this.prisma.approvalRequest.count({ where }),
      this.prisma.approvalRequest.findMany({
        where,
        include: approvalSummaryInclude,
        orderBy: [
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
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
  ): Promise<ApprovalDetailRow | null> {
    return this.prisma.approvalRequest.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
        ...(clientOrganizationId ? { clientOrganizationId } : {}),
      },
      include: approvalDetailInclude,
    });
  }

  findOpenForSubject(
    subjectType: Prisma.ApprovalRequestWhereInput['subjectType'],
    subjectId: string,
  ): Promise<ApprovalDetailRow | null> {
    return this.prisma.approvalRequest.findFirst({
      where: {
        subjectType,
        subjectId,
        deletedAt: null,
        status: { in: ['DRAFT', 'INTERNAL_REVIEW', 'PUBLISHED', 'CHANGES_REQUESTED'] },
      },
      include: approvalDetailInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.ApprovalRequestUncheckedCreateInput, fileIds: string[] = []) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.approvalRequest.create({
        data: {
          ...data,
          history: {
            create: { toStatus: 'DRAFT', side: 'INTERNAL', actorId: data.requestedById },
          },
        },
        include: approvalDetailInclude,
      });
      if (fileIds.length > 0) {
        await tx.file.updateMany({
          where: {
            id: { in: fileIds },
            organizationId: data.organizationId,
            uploadedById: data.requestedById,
            approvalId: null,
            deletedAt: null,
          },
          data: { approvalId: row.id },
        });
      }
      return row;
    });
  }

  update(id: string, data: Prisma.ApprovalRequestUncheckedUpdateInput): Promise<ApprovalDetailRow> {
    return this.prisma.approvalRequest.update({
      where: { id },
      data,
      include: approvalDetailInclude,
    });
  }

  transition(
    id: string,
    from: ApprovalStatus,
    to: ApprovalStatus,
    actorId: string,
    side: 'INTERNAL' | 'CLIENT',
    comment: string | null,
    data: Prisma.ApprovalRequestUncheckedUpdateInput = {},
  ): Promise<ApprovalDetailRow> {
    return this.prisma.approvalRequest.update({
      where: { id },
      data: {
        ...data,
        status: to,
        history: { create: { fromStatus: from, toStatus: to, side, comment, actorId } },
      },
      include: approvalDetailInclude,
    });
  }
}
