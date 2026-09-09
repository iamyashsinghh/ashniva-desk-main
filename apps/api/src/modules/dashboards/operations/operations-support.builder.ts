import {
  TICKET_STATUS,
  type OperationsSupport,
  type OperationsSupportRouting,
  type OperationsSupportTicket,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { Prisma } from '../../../generated/prisma/client';
import { toTicketSummary } from '../../tickets/tickets.mapper';
import { ticketSummaryInclude } from '../../tickets/tickets.repository';
import { OPEN_TICKETS, type DashboardQueries } from '../dashboard-queries';
import type { OperationsFilters } from './operations-filters';

const ATTENTION_LIST_SIZE = 10;

const NEW_TICKETS: Prisma.TicketWhereInput = {
  status: { in: [TICKET_STATUS.NEW, TICKET_STATUS.REOPENED] },
};
const ASSIGNED_TICKETS: Prisma.TicketWhereInput = {
  status: { in: [TICKET_STATUS.ASSIGNED, TICKET_STATUS.AUTO_ASSIGNED] },
};
const ESCALATED_TICKETS: Prisma.TicketWhereInput = { status: TICKET_STATUS.ESCALATED };

/**
 * Open tickets whose acknowledgement timer has run out with nobody picking them up.
 *
 * Judged from the stored instants rather than a status, for the same reason `slaTicketWhere` is:
 * the answer has to be right between two runs of the monitor, not only just after one. This is
 * the router's own clock, not the SLA's — one asks "did anybody take this", the other "did the
 * client get an answer".
 */
function unacknowledgedWhere(now: Date): Prisma.TicketWhereInput {
  return {
    status: { in: OPEN_TICKETS },
    routingState: { acknowledgedAt: null, acknowledgeDueAt: { lte: now } },
  };
}

/**
 * The support desk as an operations reader needs it: what is unowned, what is late, what escalated.
 *
 * Seven queries, plus one more when the caller may see the routing configuration. Every KPI is a
 * `count()` so it still matches the list its card opens once the list runs past a page.
 */
export async function buildOperationsSupport(
  q: DashboardQueries,
  prisma: PrismaService,
  filters: OperationsFilters,
  canManageRouting: boolean,
  now = new Date(),
): Promise<OperationsSupport> {
  const scope = filters.tickets;
  const unacknowledged = unacknowledgedWhere(now);
  const attentionWhere: Prisma.TicketWhereInput = {
    ...scope,
    OR: [ESCALATED_TICKETS, unacknowledged],
  };
  const [
    newTickets,
    assigned,
    unacknowledgedCount,
    escalated,
    slaAtRisk,
    slaBreached,
    attention,
    routing,
  ] = await Promise.all([
    q.countTickets({ ...scope, ...NEW_TICKETS }),
    q.countTickets({ ...scope, ...ASSIGNED_TICKETS }),
    q.countTickets({ ...scope, ...unacknowledged }),
    q.countTickets({ ...scope, ...ESCALATED_TICKETS }),
    q.countTickets({ ...scope, ...q.slaTickets('at-risk', now) }),
    q.countTickets({ ...scope, ...q.slaTickets('breached', now) }),
    prisma.ticket.findMany({
      where: q.ticketWhere(attentionWhere),
      include: { ...ticketSummaryInclude, routingState: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: ATTENTION_LIST_SIZE,
    }),
    canManageRouting ? routingFor(prisma, q.ctx.organizationId, filters) : Promise.resolve(null),
  ]);

  return {
    newTickets,
    assigned,
    unacknowledged: unacknowledgedCount,
    escalated,
    slaAtRisk,
    slaBreached,
    attention: attention.map((row): OperationsSupportTicket => ({
      ticket: toTicketSummary(row),
      owner: row.assignedTo,
      acknowledgeDueAt: row.routingState?.acknowledgeDueAt?.toISOString() ?? null,
      acknowledgedAt: row.routingState?.acknowledgedAt?.toISOString() ?? null,
      escalationLevel: row.routingState?.escalationLevel ?? 0,
      queueReason: row.routingState?.queueReason ?? null,
    })),
    // Absent, not empty: a caller who may not manage routing is not told there are zero fallbacks.
    ...(routing ? { routing } : {}),
  };
}

/** Where a ticket goes when the chain comes up empty, per project. */
async function routingFor(
  prisma: PrismaService,
  organizationId: string,
  filters: OperationsFilters,
): Promise<OperationsSupportRouting[]> {
  const rows = await prisma.supportOwnership.findMany({
    where: {
      organizationId,
      ...(filters.organizationWide ? {} : { projectId: { in: filters.projectIds } }),
      project: { deletedAt: null },
    },
    select: {
      autoRouteEnabled: true,
      ackMinutes: true,
      escalationMinutes: true,
      project: { select: { id: true, code: true, name: true } },
      fallbackUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { project: { name: 'asc' } },
  });
  return rows.map((row) => ({
    project: row.project,
    autoRouteEnabled: row.autoRouteEnabled,
    fallbackUser: row.fallbackUser,
    ackMinutes: row.ackMinutes,
    escalationMinutes: row.escalationMinutes,
  }));
}
