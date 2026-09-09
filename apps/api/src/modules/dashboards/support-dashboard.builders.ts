import {
  PRIORITY,
  TICKET_STATUS,
  type EmployeeDashboard,
  type SupportDashboard,
} from '@ashniva/types';

import { OPEN_TICKETS, type DashboardQueries } from './dashboard-queries';

export async function buildSupportDashboard(q: DashboardQueries): Promise<SupportDashboard> {
  const { userId } = q.ctx;
  const isNew = { status: { in: [TICKET_STATUS.NEW, TICKET_STATUS.REOPENED] } };
  const mine = { assignedToId: userId, status: { in: OPEN_TICKETS } };
  const waitingForClient = { status: TICKET_STATUS.WAITING_CLIENT };
  const isCritical = { priority: PRIORITY.CRITICAL, status: { in: OPEN_TICKETS } };
  const [
    newTickets,
    myTickets,
    waiting,
    critical,
    slaTickets,
    newCount,
    mineCount,
    waitingCount,
    criticalCount,
    inProgress,
    resolvedToday,
    slaAtRisk,
    slaBreached,
  ] = await Promise.all([
    q.tickets(isNew, 20),
    q.tickets(mine, 20),
    q.tickets(waitingForClient, 20),
    q.tickets(isCritical, 20),
    q.slaTicketList(20),
    // Counted rather than measured from the capped card lists, so each KPI still matches the
    // total of the list its card opens once there are more than twenty rows.
    q.countTickets(isNew),
    q.countTickets(mine),
    q.countTickets(waitingForClient),
    q.countTickets(isCritical),
    q.countTickets({ status: TICKET_STATUS.IN_PROGRESS }),
    q.countTickets(q.resolvedToday()),
    q.countTickets(q.slaTickets('at-risk')),
    q.countTickets(q.slaTickets('breached')),
  ]);
  return {
    kind: 'support',
    kpis: {
      newTickets: newCount,
      assignedToMe: mineCount,
      inProgress,
      waitingForClient: waitingCount,
      critical: criticalCount,
      resolvedToday,
      slaAtRisk,
      slaBreached,
    },
    newTickets,
    myTickets,
    waitingForClient: waiting,
    criticalTickets: critical,
    slaTickets,
  };
}

/** Group-company employees: their own tickets (the provider organization holds the rows). */
export async function buildEmployeeDashboard(
  q: DashboardQueries,
  requesterId: string,
  clientOrganizationId: string,
): Promise<EmployeeDashboard> {
  const tickets = await q.tickets({ requesterId, clientOrganizationId }, 30);
  return {
    kind: 'employee',
    kpis: {
      open: tickets.filter((ticket) => !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status))
        .length,
      waitingForYou: tickets.filter(
        (ticket) =>
          ticket.status === TICKET_STATUS.WAITING_CLIENT ||
          ticket.status === TICKET_STATUS.RESOLVED,
      ).length,
      resolved: tickets.filter(
        (ticket) =>
          ticket.status === TICKET_STATUS.RESOLVED || ticket.status === TICKET_STATUS.CLOSED,
      ).length,
    },
    tickets,
  };
}
