import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { IncidentStatus, IncidentTimelineKind, Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true } } as const;

export const incidentSummaryInclude = {
  owner: userRef,
  project: { select: { id: true, code: true, name: true } },
  product: { select: { id: true, code: true, name: true } },
} satisfies Prisma.IncidentInclude;

export const incidentDetailInclude = {
  ...incidentSummaryInclude,
  emergencyFixRequestedBy: userRef,
  emergencyFixDecidedBy: userRef,
  timeline: { orderBy: { occurredAt: 'asc' }, include: { actor: userRef } },
  links: {
    orderBy: { addedAt: 'asc' },
    include: {
      addedBy: userRef,
      ticket: { select: { id: true, number: true } },
      task: { select: { id: true, number: true, project: { select: { code: true } } } },
      release: { select: { id: true, version: true } },
    },
  },
} satisfies Prisma.IncidentInclude;

export type IncidentSummaryRow = Prisma.IncidentGetPayload<{
  include: typeof incidentSummaryInclude;
}>;
export type IncidentDetailRow = Prisma.IncidentGetPayload<{
  include: typeof incidentDetailInclude;
}>;

export interface IncidentListFilter {
  organizationId: string;
  status?: IncidentStatus[];
  projectId?: string;
  problemId?: string;
  ownerId?: string;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface IncidentPage {
  items: IncidentSummaryRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * Incident data access. Every query names `organizationId`, the writes included.
 *
 * Timeline entries and links are reached through an incident the caller has already been scoped
 * to, so they are addressed by `incidentId` — but they still carry the organization on the row,
 * because row-level security judges every table on its own.
 */
@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: IncidentListFilter): Promise<IncidentPage> {
    const search = filter.search?.trim();
    const where: Prisma.IncidentWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.problemId ? { problemId: filter.problemId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { impact: { contains: search, mode: 'insensitive' } },
              ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        include: incidentSummaryInclude,
        // Severity first: an open Critical belongs at the top of the list whoever is looking.
        orderBy: [{ severity: 'desc' }, { startedAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findDetail(organizationId: string, id: string): Promise<IncidentDetailRow | null> {
    return this.prisma.incident.findFirst({
      where: { id, organizationId },
      include: incidentDetailInclude,
    });
  }

  /**
   * Creates an incident, takes its number and writes its first timeline entry, together.
   *
   * All three in one transaction: an incident with no number cannot be referred to, and one whose
   * timeline does not start at the moment it opened is a timeline with a hole at the beginning.
   */
  create(
    organizationId: string,
    data: Omit<Prisma.IncidentUncheckedCreateInput, 'organizationId' | 'number'>,
    opening: { body: string; actorId: string },
  ): Promise<IncidentDetailRow> {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.organizationCounter.upsert({
        where: { organizationId_kind: { organizationId, kind: 'INCIDENT' } },
        update: { value: { increment: 1 } },
        create: { organizationId, kind: 'INCIDENT', value: 1 },
      });
      return tx.incident.create({
        data: {
          ...data,
          organizationId,
          number: counter.value,
          timeline: {
            create: {
              organizationId,
              kind: 'OPENED',
              body: opening.body,
              actorId: opening.actorId,
            },
          },
        },
        include: incidentDetailInclude,
      });
    });
  }

  /**
   * Applies a change and appends the timeline entries that describe it, in one transaction.
   *
   * The timeline is the incident's own account of itself, so an entry claiming a change that did
   * not commit would be worse than no entry at all. `expect` pins the update to the status or the
   * emergency-fix state the caller checked, so two responders acting at once cannot both win:
   * `false` is the caller's 409.
   */
  async apply(input: {
    organizationId: string;
    id: string;
    expect?: Prisma.IncidentWhereInput;
    data: Prisma.IncidentUncheckedUpdateInput;
    entries?: Array<{ kind: IncidentTimelineKind; body: string; actorId: string }>;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.incident.updateMany({
        where: { id: input.id, organizationId: input.organizationId, ...input.expect },
        data: input.data,
      });
      if (claimed.count === 0) {
        return false;
      }
      for (const entry of input.entries ?? []) {
        await tx.incidentTimelineEntry.create({
          data: {
            organizationId: input.organizationId,
            incidentId: input.id,
            kind: entry.kind,
            body: entry.body,
            actorId: entry.actorId,
          },
        });
      }
      return true;
    });
  }

  /**
   * Adds a link and the timeline entry recording it.
   *
   * The three target columns are nullable foreign keys rather than one polymorphic id, so the
   * database still refuses a link to a row that does not exist.
   */
  addLink(input: {
    organizationId: string;
    incidentId: string;
    kind: 'TICKET' | 'TASK' | 'RELEASE';
    ticketId?: string;
    taskId?: string;
    releaseId?: string;
    addedById: string;
    body: string;
  }): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.incidentLink.create({
        data: {
          organizationId: input.organizationId,
          incidentId: input.incidentId,
          kind: input.kind,
          ticketId: input.ticketId ?? null,
          taskId: input.taskId ?? null,
          releaseId: input.releaseId ?? null,
          addedById: input.addedById,
        },
      });
      await tx.incidentTimelineEntry.create({
        data: {
          organizationId: input.organizationId,
          incidentId: input.incidentId,
          kind: 'LINK_ADDED',
          body: input.body,
          actorId: input.addedById,
        },
      });
    });
  }

  /** Resolves what a link points at, scoped to the provider, with the label the screen shows. */
  async findLinkTarget(
    organizationId: string,
    ids: { ticketId?: string; taskId?: string; releaseId?: string },
  ): Promise<{ label: string } | null> {
    if (ids.ticketId) {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ids.ticketId, organizationId, deletedAt: null },
        select: { number: true },
      });
      return ticket ? { label: `T-${ticket.number}` } : null;
    }
    if (ids.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: ids.taskId, organizationId, deletedAt: null },
        select: { number: true, project: { select: { code: true } } },
      });
      return task ? { label: `${task.project.code}-${task.number}` } : null;
    }
    if (ids.releaseId) {
      const release = await this.prisma.release.findFirst({
        where: { id: ids.releaseId, organizationId, deletedAt: null },
        select: { version: true },
      });
      return release ? { label: release.version } : null;
    }
    return null;
  }

  findProject(organizationId: string, projectId: string): Promise<{ id: string } | null> {
    return this.prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true },
    });
  }

  findProduct(organizationId: string, productId: string): Promise<{ id: string } | null> {
    return this.prisma.product.findFirst({
      where: { id: productId, organizationId, deletedAt: null },
      select: { id: true },
    });
  }

  findProblem(organizationId: string, problemId: string): Promise<{ id: string } | null> {
    return this.prisma.problem.findFirst({
      where: { id: problemId, organizationId },
      select: { id: true },
    });
  }

  /** An internal colleague, for the owner field. Membership of the provider is the check. */
  findMember(organizationId: string, userId: string): Promise<{ userId: string } | null> {
    return this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, deletedAt: null },
      select: { userId: true },
    });
  }
}
