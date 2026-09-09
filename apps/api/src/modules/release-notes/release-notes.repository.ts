import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReleaseNoteItemKind, ReleaseNoteStatus } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { itemIdentity, type SourceCandidate } from './draft-selection';

const detailInclude = {
  project: { select: { id: true, code: true, name: true } },
  items: { orderBy: { sortOrder: 'asc' } },
  history: {
    include: { changedBy: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ReleaseNoteInclude;

const summaryInclude = {
  project: { select: { id: true, code: true, name: true } },
  _count: { select: { items: true } },
} satisfies Prisma.ReleaseNoteInclude;

export type ReleaseNoteDetailRow = Prisma.ReleaseNoteGetPayload<{ include: typeof detailInclude }>;
export type ReleaseNoteSummaryRow = Prisma.ReleaseNoteGetPayload<{
  include: typeof summaryInclude;
}>;

export interface ReleaseNoteListFilter {
  organizationId: string;
  projectId?: string;
  status?: ReleaseNoteStatus[];
  limit: number;
  cursor?: string;
}

@Injectable()
export class ReleaseNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: ReleaseNoteListFilter,
  ): Promise<{ items: ReleaseNoteSummaryRow[]; nextCursor: string | null; total: number }> {
    const where: Prisma.ReleaseNoteWhereInput = {
      organizationId: filter.organizationId,
      deletedAt: null,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.releaseNote.count({ where }),
      this.prisma.releaseNote.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  /**
   * Portal list. Separate from `list` rather than a flag on it, because the two differ in the
   * column they scope by *and* in the statuses they may return — and a published-only filter that
   * can be switched off by a parameter is exactly the kind of thing that gets switched off.
   */
  async listForClient(filter: {
    clientOrganizationId: string;
    projectId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: ReleaseNoteSummaryRow[]; nextCursor: string | null; total: number }> {
    const where: Prisma.ReleaseNoteWhereInput = {
      clientOrganizationId: filter.clientOrganizationId,
      status: 'PUBLISHED',
      deletedAt: null,
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.releaseNote.count({ where }),
      this.prisma.releaseNote.findMany({
        where,
        include: summaryInclude,
        orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findDetail(organizationId: string, id: string): Promise<ReleaseNoteDetailRow | null> {
    return this.prisma.releaseNote.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: detailInclude,
    });
  }

  /** Portal read: the client's own organization, and only a published note. */
  findPublishedForClient(
    clientOrganizationId: string,
    id: string,
  ): Promise<ReleaseNoteDetailRow | null> {
    return this.prisma.releaseNote.findFirst({
      where: { id, clientOrganizationId, status: 'PUBLISHED', deletedAt: null },
      include: detailInclude,
    });
  }

  create(data: Prisma.ReleaseNoteUncheckedCreateInput): Promise<ReleaseNoteDetailRow> {
    return this.prisma.releaseNote.create({ data, include: detailInclude });
  }

  update(id: string, data: Prisma.ReleaseNoteUncheckedUpdateInput): Promise<ReleaseNoteDetailRow> {
    return this.prisma.releaseNote.update({ where: { id }, data, include: detailInclude });
  }

  /** Status change plus its history row, together, so the trail can never miss a transition. */
  async transition(
    id: string,
    from: ReleaseNoteStatus,
    to: ReleaseNoteStatus,
    changedById: string,
    note: string | null,
    extra: Prisma.ReleaseNoteUncheckedUpdateInput = {},
  ): Promise<ReleaseNoteDetailRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.releaseNoteHistory.create({
        data: { releaseNoteId: id, fromStatus: from, toStatus: to, changedById, note },
      });
      return tx.releaseNote.update({
        where: { id },
        data: { ...extra, status: to },
        include: detailInclude,
      });
    });
  }

  /**
   * `identity` is derived here rather than passed in, so the unique index and the de-duplication
   * in `selectDraftItems` are guaranteed to be computing the same key.
   */
  addItems(
    releaseNoteId: string,
    items: Omit<Prisma.ReleaseNoteItemUncheckedCreateInput, 'releaseNoteId' | 'identity'>[],
  ): Promise<Prisma.BatchPayload> {
    return this.prisma.releaseNoteItem.createMany({
      data: items.map((item) => ({
        ...item,
        releaseNoteId,
        identity: identityFor(item.kind, item.refId ?? null, item.externalRef ?? null),
      })),
      skipDuplicates: true,
    });
  }

  removeItem(releaseNoteId: string, itemId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.releaseNoteItem.deleteMany({ where: { id: itemId, releaseNoteId } });
  }

  async reorderItems(releaseNoteId: string, orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.releaseNoteItem.updateMany({
          where: { id, releaseNoteId },
          data: { sortOrder: index * 10 },
        }),
      ),
    );
  }

  /** The most recent published note for a project, used to work out the reporting period. */
  async lastPublishedAt(organizationId: string, projectId: string): Promise<Date | null> {
    const row = await this.prisma.releaseNote.findFirst({
      where: { organizationId, projectId, status: 'PUBLISHED', deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      select: { publishedAt: true },
    });
    return row?.publishedAt ?? null;
  }

  /**
   * Everything that could go into a draft for this project and period.
   *
   * Each query filters on client visibility in SQL rather than fetching everything and filtering
   * later: internal work is never loaded, so it cannot be leaked by a mistake further down. The
   * shapes returned deliberately carry no estimate, cost, internal comment or assignee.
   */
  async collectCandidates(
    organizationId: string,
    projectId: string,
    start: Date | null,
    end: Date,
  ): Promise<SourceCandidate[]> {
    const window = { gte: start ?? undefined, lt: end };

    const [tasks, tickets, updates, activities] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          organizationId,
          projectId,
          deletedAt: null,
          status: 'COMPLETED',
          clientVisible: true,
          completedAt: window,
        },
        select: { id: true, title: true, completedAt: true },
        take: 200,
      }),
      this.prisma.ticket.findMany({
        where: {
          organizationId,
          projectId,
          deletedAt: null,
          status: { in: ['RESOLVED', 'CLOSED'] },
          resolvedAt: window,
        },
        select: { id: true, title: true, resolvedAt: true },
        take: 200,
      }),
      this.prisma.clientUpdate.findMany({
        where: {
          organizationId,
          projectId,
          status: 'PUBLISHED',
          publishedAt: window,
        },
        select: { id: true, title: true, publishedAt: true },
        take: 200,
      }),
      this.prisma.codeActivity.findMany({
        where: {
          organizationId,
          // Only what actually landed: a merge, a release or a tag, never a raw commit or a
          // review, which would expose internal development chatter to a client.
          kind: { in: ['MERGE', 'RELEASE', 'TAG'] },
          occurredAt: window,
          repositoryLink: { projectId, deletedAt: null },
        },
        select: { id: true, title: true, externalId: true, occurredAt: true },
        take: 200,
      }),
    ]);

    return [
      ...tasks.map((row) => ({
        kind: 'TASK' as const,
        refId: row.id,
        externalRef: null,
        label: row.title,
        clientVisible: true,
        occurredAt: row.completedAt ?? end,
      })),
      ...tickets.map((row) => ({
        kind: 'TICKET' as const,
        refId: row.id,
        externalRef: null,
        label: row.title,
        clientVisible: true,
        occurredAt: row.resolvedAt ?? end,
      })),
      ...updates.map((row) => ({
        kind: 'CLIENT_UPDATE' as const,
        refId: row.id,
        externalRef: null,
        label: row.title,
        clientVisible: true,
        occurredAt: row.publishedAt ?? end,
      })),
      ...activities.map((row) => ({
        kind: 'CODE_ACTIVITY' as const,
        refId: null,
        externalRef: row.externalId,
        label: row.title,
        clientVisible: true,
        occurredAt: row.occurredAt,
      })),
    ];
  }
}

/**
 * The de-duplication key stored on an item.
 *
 * An item that names a source row or a provider reference is identified by it, so the same task
 * cannot be listed twice however it was added. A hand-written line names nothing, and two
 * different hand-written lines are two different lines — it gets a unique key so the constraint
 * does not collapse them.
 */
function identityFor(
  kind: ReleaseNoteItemKind,
  refId: string | null,
  externalRef: string | null,
): string {
  if (!refId && !externalRef) {
    return `${kind}:${randomUUID()}`;
  }
  return itemIdentity({ kind, refId, externalRef });
}
