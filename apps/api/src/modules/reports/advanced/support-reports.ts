import { REPORT_TYPE, SLA_TARGET_STATUS } from '@ashniva/types';

import { toTicketSla } from '../../sla-escalations/sla-state';
import {
  column,
  dateTimeCell,
  finish,
  percent,
  type ReportBuilder,
  type ReportContext,
  type ReportRow,
} from './report-context';

const DAY_MS = 86_400_000;

function ticketWhere(ctx: ReportContext) {
  return {
    organizationId: ctx.organizationId,
    deletedAt: null,
    createdAt: { gte: ctx.from, lt: new Date(ctx.to.getTime() + DAY_MS) },
    ...(ctx.clientOrganizationId ? { clientOrganizationId: ctx.clientOrganizationId } : {}),
    ...(ctx.filters.projectId ? { projectId: ctx.filters.projectId } : {}),
    ...(ctx.filters.status ? { status: ctx.filters.status as never } : {}),
  };
}

const MET = [SLA_TARGET_STATUS.MET, SLA_TARGET_STATUS.MET_LATE] as string[];

/**
 * SLA outcome per ticket raised in the range. Clients see the resolution target only; the
 * first-response clock and the assignee are the provider's internal performance data.
 */
export const slaPerformance: ReportBuilder = async (ctx) => {
  const tickets = await ctx.prisma.ticket.findMany({
    where: { ...ticketWhere(ctx), sla: { isNot: null } },
    include: {
      clientOrganization: { select: { name: true } },
      assignedTo: { select: { name: true } },
      sla: { include: { policy: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const internal = ctx.audience === 'internal';
  const rows: ReportRow[] = tickets.map((ticket) => {
    const sla = toTicketSla(ticket.sla, ctx.now);
    const row: ReportRow = {
      key: `T-${ticket.number}`,
      title: ticket.title,
      client: ticket.clientOrganization.name,
      priority: ticket.priority,
      status: ticket.status,
      raisedAt: dateTimeCell(ticket.createdAt),
      policy: sla?.policy?.name ?? '',
      resolutionStatus: sla?.resolution.status ?? SLA_TARGET_STATUS.NONE,
      resolutionDueAt: sla?.resolution.dueAt ?? null,
      resolvedAt: dateTimeCell(ticket.resolvedAt),
      pausedMinutes: sla?.pausedTotalMinutes ?? 0,
    };
    if (internal) {
      row.firstResponseStatus = sla?.firstResponse.status ?? SLA_TARGET_STATUS.NONE;
      row.firstResponseDueAt = sla?.firstResponse.dueAt ?? null;
      row.firstResponseAt = sla?.firstResponse.metAt ?? null;
      row.assignee = ticket.assignedTo?.name ?? '';
    }
    return row;
  });
  const resolved = rows.filter((row) => MET.includes(String(row.resolutionStatus)));
  const onTime = resolved.filter((row) => row.resolutionStatus === SLA_TARGET_STATUS.MET);
  const breached = rows.filter(
    (row) =>
      row.resolutionStatus === SLA_TARGET_STATUS.BREACHED ||
      row.resolutionStatus === SLA_TARGET_STATUS.MET_LATE ||
      (internal &&
        (row.firstResponseStatus === SLA_TARGET_STATUS.BREACHED ||
          row.firstResponseStatus === SLA_TARGET_STATUS.MET_LATE)),
  );
  return finish(
    ctx,
    REPORT_TYPE.SLA_PERFORMANCE,
    'SLA performance and breaches',
    [
      column('key', 'Ticket'),
      column('title', 'Title'),
      column('client', 'Client'),
      column('priority', 'Priority', 'status'),
      column('status', 'Status', 'status'),
      column('raisedAt', 'Raised', 'datetime'),
      column('policy', 'Policy'),
      ...(internal
        ? [
            column('firstResponseStatus', 'First response', 'status'),
            column('firstResponseDueAt', 'First response due', 'datetime'),
            column('firstResponseAt', 'First responded', 'datetime'),
          ]
        : []),
      column('resolutionStatus', 'Resolution', 'status'),
      column('resolutionDueAt', 'Resolution due', 'datetime'),
      column('resolvedAt', 'Resolved', 'datetime'),
      column('pausedMinutes', 'Paused', 'minutes'),
      ...(internal ? [column('assignee', 'Assignee')] : []),
    ],
    rows,
    [
      { label: 'Tickets with SLA', value: rows.length },
      { label: 'Resolved on time', value: `${percent(onTime.length, resolved.length)}%` },
      { label: 'Breached', value: breached.length },
      {
        label: 'At risk now',
        value: rows.filter((row) => row.resolutionStatus === SLA_TARGET_STATUS.AT_RISK).length,
      },
    ],
  );
};

/** Tickets raised per day in the range, with resolution counts and average time to resolve. */
export const ticketVolume: ReportBuilder = async (ctx) => {
  const tickets = await ctx.prisma.ticket.findMany({
    where: ticketWhere(ctx),
    select: { createdAt: true, resolvedAt: true, status: true, priority: true, type: true },
    orderBy: { createdAt: 'asc' },
  });
  const byDay = new Map<
    string,
    { raised: number; resolved: number; critical: number; hours: number[]; open: number }
  >();
  for (let day = ctx.from.getTime(); day <= ctx.to.getTime(); day += DAY_MS) {
    byDay.set(new Date(day).toISOString().slice(0, 10), {
      raised: 0,
      resolved: 0,
      critical: 0,
      hours: [],
      open: 0,
    });
  }
  for (const ticket of tickets) {
    const day = byDay.get(ticket.createdAt.toISOString().slice(0, 10));
    if (!day) {
      continue;
    }
    day.raised += 1;
    if (ticket.priority === 'CRITICAL') {
      day.critical += 1;
    }
    if (ticket.resolvedAt) {
      day.resolved += 1;
      day.hours.push((ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 3_600_000);
    } else if (!['CLOSED', 'CANCELLED'].includes(ticket.status)) {
      day.open += 1;
    }
  }
  const rows: ReportRow[] = [...byDay.entries()].map(([date, day]) => ({
    date,
    raised: day.raised,
    critical: day.critical,
    resolved: day.resolved,
    stillOpen: day.open,
    avgResolutionHours: day.hours.length
      ? Number((day.hours.reduce((sum, value) => sum + value, 0) / day.hours.length).toFixed(1))
      : null,
  }));
  const allHours = tickets
    .filter((ticket) => ticket.resolvedAt)
    .map(
      (ticket) => ((ticket.resolvedAt as Date).getTime() - ticket.createdAt.getTime()) / 3_600_000,
    );
  return finish(
    ctx,
    REPORT_TYPE.TICKET_VOLUME,
    'Ticket volume and resolution',
    [
      column('date', 'Date', 'date'),
      column('raised', 'Raised', 'number'),
      column('critical', 'Critical', 'number'),
      column('resolved', 'Resolved', 'number'),
      column('stillOpen', 'Still open', 'number'),
      column('avgResolutionHours', 'Avg. hours to resolve', 'number'),
    ],
    rows,
    [
      { label: 'Raised', value: tickets.length },
      { label: 'Resolved', value: allHours.length },
      {
        label: 'Avg. hours to resolve',
        value: allHours.length
          ? (allHours.reduce((sum, value) => sum + value, 0) / allHours.length).toFixed(1)
          : '—',
      },
    ],
  );
};
