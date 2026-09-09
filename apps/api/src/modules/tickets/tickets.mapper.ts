import type {
  Priority,
  TaskStatus,
  TicketActionAvailability,
  TicketDetail,
  TicketHistoryEntry,
  TicketSource,
  TicketStatus,
  TicketSummary,
  TicketType,
} from '@ashniva/types';

import { toTicketSla } from '../sla-escalations/sla-state';
import { toComment, toFile } from '../tasks/tasks.mapper';
import type { TicketDetailRow, TicketSummaryRow } from './tickets.repository';

export function ticketKey(ticket: { number: number }): string {
  return `T-${ticket.number}`;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toTicketSummary(row: TicketSummaryRow): TicketSummary {
  return {
    id: row.id,
    number: row.number,
    key: ticketKey(row),
    title: row.title,
    type: row.type as TicketType,
    priority: row.priority as Priority,
    status: row.status as TicketStatus,
    source: row.source as TicketSource,
    project: row.project,
    clientOrganization: row.clientOrganization,
    requester: row.requester,
    assignedTo: row.assignedTo,
    team: row.team,
    module: row.module,
    productVersion: row.productVersion,
    linkedTaskCount: row._count.linkedTasks,
    sla: toTicketSla(row.sla),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
  };
}

export function toTicketHistoryEntry(
  row: TicketDetailRow['statusHistory'][number],
): TicketHistoryEntry {
  return {
    id: row.id,
    fromStatus: row.fromStatus as TicketStatus | null,
    toStatus: row.toStatus as TicketStatus,
    changedBy: row.changedBy,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTicketDetail(
  row: TicketDetailRow,
  actions: TicketActionAvailability[],
  options: { includeInternalComments: boolean },
): TicketDetail {
  return {
    ...toTicketSummary(row),
    description: row.description,
    impact: row.impact,
    resolution: row.resolution,
    history: row.statusHistory.map(toTicketHistoryEntry),
    comments: row.comments
      .filter((comment) => options.includeInternalComments || comment.visibility === 'CLIENT')
      .map(toComment),
    linkedTasks: row.linkedTasks.map((task) => ({
      id: task.id,
      key: `${task.project.code}-${task.number}`,
      title: task.title,
      status: task.status as TaskStatus,
      assignedTo: task.assignedTo,
    })),
    files: row.files.map(toFile),
    actions,
  };
}
