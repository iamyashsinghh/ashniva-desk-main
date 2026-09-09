import { Injectable } from '@nestjs/common';
import type { AiSummaryStatus, AiSummaryType } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

/**
 * Data access for AI summaries, scoped to a tenant on every path.
 *
 * The internal and portal reads are separate methods with separate `select` clauses rather than
 * one method with a flag. The portal read cannot accidentally grow an internal field, because it
 * does not select any.
 */

const DETAIL_INCLUDE = {
  project: { select: { id: true, code: true } },
  subjectUser: { select: { id: true, name: true } },
  clientOrganization: { select: { id: true, name: true } },
  approvedBy: { select: { name: true } },
  publishedBy: { select: { name: true } },
  sources: { orderBy: { sortOrder: 'asc' } },
  versions: {
    orderBy: { version: 'desc' },
    include: { createdBy: { select: { name: true } } },
  },
  runs: { orderBy: { startedAt: 'desc' }, take: 20 },
} satisfies Prisma.AiSummaryInclude;

export type AiSummaryDetailRow = Prisma.AiSummaryGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const LIST_SELECT = {
  id: true,
  type: true,
  status: true,
  title: true,
  projectId: true,
  subjectUserId: true,
  periodStart: true,
  periodEnd: true,
  version: true,
  generatedAt: true,
  updatedAt: true,
  project: { select: { code: true } },
  subjectUser: { select: { name: true } },
  _count: { select: { sources: true } },
} satisfies Prisma.AiSummarySelect;

export type AiSummaryListRowData = Prisma.AiSummaryGetPayload<{ select: typeof LIST_SELECT }>;

export interface ListQuery {
  organizationId: string;
  type?: AiSummaryType[];
  status?: AiSummaryStatus[];
  projectId?: string;
  subjectUserId?: string;
  search?: string;
  limit: number;
  cursor?: string;
}

@Injectable()
export class AiSummariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQuery) {
    const where: Prisma.AiSummaryWhereInput = {
      organizationId: query.organizationId,
      deletedAt: null,
      ...(query.type?.length ? { type: { in: query.type } } : {}),
      ...(query.status?.length ? { status: { in: query.status } } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.subjectUserId ? { subjectUserId: query.subjectUserId } : {}),
      ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    // One extra row, so "is there another page" needs no second count query.
    const rows = await this.prisma.aiSummary.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const total = await this.prisma.aiSummary.count({ where });
    const items = rows.slice(0, query.limit);
    return {
      items,
      total,
      nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null,
    };
  }

  findDetail(organizationId: string, id: string): Promise<AiSummaryDetailRow | null> {
    return this.prisma.aiSummary.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
  }

  create(data: Prisma.AiSummaryUncheckedCreateInput) {
    return this.prisma.aiSummary.create({ data, include: DETAIL_INCLUDE });
  }

  update(id: string, data: Prisma.AiSummaryUncheckedUpdateInput) {
    return this.prisma.aiSummary.update({ where: { id }, data });
  }

  /**
   * Claims the summary for a generation run.
   *
   * A conditional update rather than a read followed by a write: the status predicate is
   * evaluated by the database, so two workers that pick up the same job cannot both start. The
   * loser updates zero rows and stops. The three claimable statuses are the ones a person can
   * leave a summary in; GENERATING is absent, which is what makes the claim exclusive.
   */
  async claimForGeneration(id: string, organizationId: string): Promise<boolean> {
    const result = await this.prisma.aiSummary.updateMany({
      where: {
        id,
        organizationId,
        deletedAt: null,
        status: { in: ['DRAFT', 'CHANGES_REQUESTED', 'GENERATION_FAILED'] },
      },
      data: { status: 'GENERATING' },
    });
    return result.count === 1;
  }

  /** Keeps the current text as a version before it is overwritten. */
  archiveVersion(
    summary: {
      id: string;
      version: number;
      status: AiSummaryStatus;
      internalContent: string | null;
      clientContent: string | null;
    },
    createdById: string,
    note: string,
  ) {
    return this.prisma.aiSummaryVersion.create({
      data: {
        summaryId: summary.id,
        version: summary.version,
        status: summary.status,
        internalContent: summary.internalContent,
        clientContent: summary.clientContent,
        note,
        createdById,
      },
    });
  }

  findVersion(summaryId: string, version: number) {
    return this.prisma.aiSummaryVersion.findFirst({
      where: { summaryId, version },
      include: { createdBy: { select: { name: true } } },
    });
  }

  /** Replaces the recorded sources wholesale: a regeneration re-reads the period from scratch. */
  async replaceSources(summaryId: string, sources: Prisma.AiSummarySourceCreateManyInput[]) {
    await this.prisma.$transaction([
      this.prisma.aiSummarySource.deleteMany({ where: { summaryId } }),
      ...(sources.length > 0 ? [this.prisma.aiSummarySource.createMany({ data: sources })] : []),
    ]);
  }

  startRun(data: Prisma.AiGenerationRunUncheckedCreateInput) {
    return this.prisma.aiGenerationRun.create({ data });
  }

  finishRun(id: string, data: Prisma.AiGenerationRunUncheckedUpdateInput) {
    return this.prisma.aiGenerationRun.update({ where: { id }, data });
  }

  /** Published client-facing summaries for one client organization. */
  listForClient(clientOrganizationId: string, limit: number, cursor?: string) {
    return this.prisma.aiSummary.findMany({
      where: {
        clientOrganizationId,
        deletedAt: null,
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        type: true,
        title: true,
        projectId: true,
        periodStart: true,
        periodEnd: true,
        clientContent: true,
        publishedAt: true,
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  findForClient(clientOrganizationId: string, id: string) {
    return this.prisma.aiSummary.findFirst({
      where: { id, clientOrganizationId, deletedAt: null, status: 'PUBLISHED' },
      select: {
        id: true,
        type: true,
        title: true,
        projectId: true,
        periodStart: true,
        periodEnd: true,
        clientContent: true,
        publishedAt: true,
      },
    });
  }

  /** Token and call totals for a period, for the usage screen. */
  async usage(organizationId: string, from: Date, to: Date) {
    const runs = await this.prisma.aiGenerationRun.findMany({
      where: { organizationId, startedAt: { gte: from, lt: to } },
      select: {
        status: true,
        providerName: true,
        inputTokens: true,
        outputTokens: true,
        latencyMs: true,
      },
    });
    return runs;
  }
}
