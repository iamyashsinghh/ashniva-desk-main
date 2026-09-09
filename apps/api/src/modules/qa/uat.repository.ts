import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, UatDecision } from '../../generated/prisma/client';

const nameRef = { select: { name: true } } as const;

/**
 * Everything a UAT response is allowed to contain, and nothing else.
 *
 * A `select` rather than an `include`, for the same reason `testAccountFields` is one: the
 * omission becomes a type. `UatRequestRow` has no `organizationId`, so nothing downstream can
 * spread the provider's tenant into a client response, and a column added to `uat_requests` later
 * is simply absent until somebody adds it here on purpose.
 *
 * The joins are equally narrow — a name from each user, a version from the release. The release
 * row itself carries internal notes and a rollback reason; neither is reachable from this shape.
 */
export const uatRequestFields = {
  id: true,
  clientOrganizationId: true,
  /**
   * Who asked. Not on any response — the mappers are allow-lists and write every field out by
   * name, so this reaches nobody — but a client's answer has to reach the person waiting for it,
   * and `createdBy` carries only a display name.
   */
  createdById: true,
  releaseId: true,
  taskId: true,
  summaryPlain: true,
  previewUrl: true,
  checklist: true,
  status: true,
  note: true,
  decidedAt: true,
  createdAt: true,
  updatedAt: true,
  clientOrganization: nameRef,
  createdBy: nameRef,
  decidedBy: nameRef,
  release: { select: { version: true } },
} satisfies Prisma.UatRequestSelect;

const uatCommentFields = {
  id: true,
  body: true,
  fromClient: true,
  createdAt: true,
  author: nameRef,
} satisfies Prisma.UatCommentSelect;

/** Oldest first: the point of the transcript is to read the conversation in the order it happened. */
export const uatRequestDetailFields = {
  ...uatRequestFields,
  comments: { select: uatCommentFields, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.UatRequestSelect;

export type UatRequestRow = Prisma.UatRequestGetPayload<{ select: typeof uatRequestFields }>;
export type UatRequestDetailRow = Prisma.UatRequestGetPayload<{
  select: typeof uatRequestDetailFields;
}>;
export type UatCommentRowData = Prisma.UatCommentGetPayload<{ select: typeof uatCommentFields }>;

export interface UatListFilter {
  organizationId: string;
  /** Set on every portal read; a client is pinned to their own organization whatever they ask for. */
  clientOrganizationId?: string;
  status?: UatDecision;
  releaseId?: string;
  limit: number;
}

export interface UatLookup {
  id: string;
  organizationId: string;
  clientOrganizationId?: string;
}

export interface DecideUatInput {
  decision: UatDecision;
  decidedById: string;
  decidedAt: Date;
  note: string | null;
}

export interface CreateUatCommentInput {
  organizationId: string;
  uatRequestId: string;
  authorId: string;
  body: string;
  fromClient: boolean;
}

/** UAT data access. Every query carries `organizationId`; row-level security is the backstop. */
@Injectable()
export class UatRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: UatListFilter): Promise<UatRequestRow[]> {
    return this.prisma.uatRequest.findMany({
      where: {
        organizationId: filter.organizationId,
        deletedAt: null,
        ...(filter.clientOrganizationId
          ? { clientOrganizationId: filter.clientOrganizationId }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.releaseId ? { releaseId: filter.releaseId } : {}),
      },
      select: uatRequestFields,
      // Pending first, because a sign-off nobody has answered is the one that holds a release up.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: filter.limit,
    });
  }

  findDetail(lookup: UatLookup): Promise<UatRequestDetailRow | null> {
    return this.prisma.uatRequest.findFirst({
      where: {
        id: lookup.id,
        organizationId: lookup.organizationId,
        deletedAt: null,
        ...(lookup.clientOrganizationId
          ? { clientOrganizationId: lookup.clientOrganizationId }
          : {}),
      },
      select: uatRequestDetailFields,
    });
  }

  create(
    data: Omit<Prisma.UatRequestUncheckedCreateInput, 'status'>,
  ): Promise<UatRequestDetailRow> {
    return this.prisma.uatRequest.create({ data, select: uatRequestDetailFields });
  }

  /**
   * Claims the decision, conditional on the request still being PENDING.
   *
   * The row was read before this call, so two people in the same client organization clicking
   * Approve and Request changes at the same moment both reach here. Matching on PENDING means the
   * second one matches nothing and gets a 409 rather than overwriting the first answer — the same
   * shape the invoice lifecycle uses for issuing.
   */
  async claimDecision(id: string, input: DecideUatInput): Promise<number> {
    const claimed = await this.prisma.uatRequest.updateMany({
      where: { id, status: 'PENDING', deletedAt: null },
      data: {
        status: input.decision,
        decidedById: input.decidedById,
        decidedAt: input.decidedAt,
        note: input.note,
      },
    });
    return claimed.count;
  }

  addComment(input: CreateUatCommentInput): Promise<UatCommentRowData> {
    return this.prisma.uatComment.create({ data: input, select: uatCommentFields });
  }
}
