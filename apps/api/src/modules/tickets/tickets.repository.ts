import { ConflictException, Injectable } from '@nestjs/common';
import { OPEN_TICKET_STATUSES, TICKET_STATUS, canTransitionTicket } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, TicketStatus } from '../../generated/prisma/client';
import { slaTicketWhere, type SlaRisk } from '../sla-escalations/sla-ticket-filter';

const userRef = { select: { id: true, name: true, email: true } } as const;

export const ticketSummaryInclude = {
  project: { select: { id: true, code: true, name: true } },
  clientOrganization: { select: { id: true, name: true, slug: true } },
  requester: userRef,
  assignedTo: userRef,
  team: { select: { id: true, name: true } },
  sla: { include: { policy: { select: { id: true, name: true } } } },
  /// The support tier, for the router's deadlines and the SLA policy precedence. The whole
  /// product is not needed and is deliberately not selected: a summary row is passed to mappers
  /// that build client-visible shapes, and every column that need not travel should not.
  product: { select: { id: true, code: true, supportTier: true } },
  _count: { select: { linkedTasks: { where: { deletedAt: null } } } },
} satisfies Prisma.TicketInclude;

export const ticketDetailInclude = {
  ...ticketSummaryInclude,
  statusHistory: { include: { changedBy: userRef }, orderBy: { createdAt: 'asc' } },
  comments: {
    where: { deletedAt: null },
    include: { author: userRef },
    orderBy: { createdAt: 'asc' },
  },
  linkedTasks: {
    where: { deletedAt: null },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      assignedTo: userRef,
      project: { select: { code: true } },
    },
    orderBy: { number: 'asc' },
  },
  files: {
    where: { deletedAt: null },
    include: { uploadedBy: userRef },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TicketInclude;

export type TicketSummaryRow = Prisma.TicketGetPayload<{ include: typeof ticketSummaryInclude }>;
export type TicketDetailRow = Prisma.TicketGetPayload<{ include: typeof ticketDetailInclude }>;

export interface TicketListFilter {
  organizationId: string;
  clientOrganizationId?: string;
  requesterId?: string;
  status?: TicketStatus[];
  projectId?: string;
  assignedToId?: string;
  priority?: Prisma.TicketWhereInput['priority'];
  type?: Prisma.TicketWhereInput['type'];
  search?: string;
  resolvedFrom?: Date;
  resolvedTo?: Date;
  /** Open tickets past their SLA warning or due time, as the dashboard KPIs count them. */
  slaRisk?: SlaRisk;
  limit: number;
  cursor?: string;
}

export interface TicketPage {
  items: TicketSummaryRow[];
  nextCursor: string | null;
  total: number;
}

/** Conditions go into `AND` so that clauses needing the same key (status, OR) all survive. */
function buildWhere(filter: TicketListFilter): Prisma.TicketWhereInput {
  const search = filter.search?.trim();
  const and: Prisma.TicketWhereInput[] = [];
  if (filter.clientOrganizationId) {
    and.push({ clientOrganizationId: filter.clientOrganizationId });
  }
  if (filter.requesterId) {
    and.push({ requesterId: filter.requesterId });
  }
  if (filter.status?.length) {
    and.push({ status: { in: filter.status } });
  }
  if (filter.projectId) {
    and.push({ projectId: filter.projectId });
  }
  if (filter.assignedToId) {
    and.push({ assignedToId: filter.assignedToId });
  }
  if (filter.priority) {
    and.push({ priority: filter.priority });
  }
  if (filter.type) {
    and.push({ type: filter.type });
  }
  if (filter.resolvedFrom || filter.resolvedTo) {
    // Resolved in the window and still resolved: a ticket reopened afterwards keeps its
    // resolvedAt but is no longer a resolution.
    and.push({
      resolvedAt: { gte: filter.resolvedFrom, lt: filter.resolvedTo },
      status: { in: [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED] },
    });
  }
  if (filter.slaRisk) {
    and.push(slaTicketWhere(filter.slaRisk));
  }
  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
      ],
    });
  }
  return {
    organizationId: filter.organizationId,
    deletedAt: null,
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/**
 * Ticket data access. organizationId is always the service provider; client reads add
 * clientOrganizationId so a client organization never sees another client's tickets.
 */
@Injectable()
export class TicketsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: TicketListFilter): Promise<TicketPage> {
    const where = buildWhere(filter);
    const [total, rows] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: ticketSummaryInclude,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  countByStatus(where: Prisma.TicketWhereInput) {
    return this.prisma.ticket.groupBy({ by: ['status'], where, _count: { _all: true } });
  }

  findDetail(
    organizationId: string,
    id: string,
    clientOrganizationId?: string,
  ): Promise<TicketDetailRow | null> {
    return this.prisma.ticket.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
        ...(clientOrganizationId ? { clientOrganizationId } : {}),
      },
      include: ticketDetailInclude,
    });
  }

  findSummary(organizationId: string, id: string): Promise<TicketSummaryRow | null> {
    return this.prisma.ticket.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: ticketSummaryInclude,
    });
  }

  create(
    organizationId: string,
    data: Omit<Prisma.TicketUncheckedCreateInput, 'organizationId' | 'number'>,
    fileIds: string[] = [],
  ): Promise<TicketSummaryRow> {
    return this.prisma.$transaction(async (tx) => {
      const counter = await tx.organizationCounter.upsert({
        where: { organizationId_kind: { organizationId, kind: 'TICKET' } },
        update: { value: { increment: 1 } },
        create: { organizationId, kind: 'TICKET', value: 1 },
      });
      const ticket = await tx.ticket.create({
        data: {
          ...data,
          organizationId,
          number: counter.value,
          statusHistory: { create: { toStatus: TICKET_STATUS.NEW, changedById: data.requesterId } },
        },
        include: ticketSummaryInclude,
      });
      if (fileIds.length > 0) {
        // Only orphan files uploaded by the requester can be attached to a brand-new ticket.
        await tx.file.updateMany({
          where: {
            id: { in: fileIds },
            organizationId,
            uploadedById: data.requesterId,
            ticketId: null,
            taskId: null,
            deletedAt: null,
          },
          data: { ticketId: ticket.id },
        });
      }
      return ticket;
    });
  }

  update(
    organizationId: string,
    id: string,
    data: Prisma.TicketUncheckedUpdateInput,
  ): Promise<TicketSummaryRow> {
    return this.prisma.ticket.update({
      where: { id, organizationId },
      data,
      include: ticketSummaryInclude,
    });
  }

  /**
   * The one place a ticket changes status.
   *
   * Two things are in the signature rather than left to the caller. `organizationId` is in the
   * `where` because a scoped read followed by an unscoped `update` by id writes across tenants the
   * first time a caller forgets the read — and one caller had: the routing escalation reached this
   * with an id and nothing else. And the move is checked against `TICKET_TRANSITIONS` here, so a
   * caller cannot reach a status by going round the table; the table is the definition of what a
   * ticket may do, and a second definition in a service is how the two stop agreeing.
   */
  // `async` so a refused move reaches the caller as a rejected promise, like every other failure
  // this method can produce, rather than as a throw before the promise exists.
  async transition(
    organizationId: string,
    id: string,
    from: TicketStatus,
    to: TicketStatus,
    changedById: string,
    note: string | null,
    data: Prisma.TicketUncheckedUpdateInput = {},
    extra?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<TicketSummaryRow> {
    assertTicketTransition(from, to);
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.update({
        where: { id, organizationId },
        data: {
          ...data,
          status: to,
          statusHistory: { create: { fromStatus: from, toStatus: to, changedById, note } },
        },
        include: ticketSummaryInclude,
      });
      if (extra) {
        await extra(tx);
      }
      return ticket;
    });
  }

  /** Activity row without a status change (assignment, conversion). */
  addActivity(
    organizationId: string,
    id: string,
    status: TicketStatus,
    changedById: string,
    note: string,
  ): Promise<TicketSummaryRow> {
    return this.prisma.ticket.update({
      where: { id, organizationId },
      data: {
        statusHistory: { create: { fromStatus: status, toStatus: status, changedById, note } },
      },
      include: ticketSummaryInclude,
    });
  }
}

/**
 * The move has to be one the workflow allows.
 *
 * A conflict rather than a bad request: the caller asked for something the ticket cannot do from
 * where it is, which is the same answer `assertTicketAction` gives at the service layer. This is
 * the backstop for the paths that do not go through it.
 */
function assertTicketTransition(from: TicketStatus, to: TicketStatus): void {
  if (from !== to && !canTransitionTicket(from, to)) {
    throw new ConflictException(`A ${from} ticket cannot become ${to}`);
  }
}

export const OPEN_TICKET_STATUS_LIST = [...OPEN_TICKET_STATUSES];
