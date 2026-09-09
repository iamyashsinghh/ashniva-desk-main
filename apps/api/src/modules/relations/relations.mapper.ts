import {
  relationRole,
  type Priority,
  type RelatedTaskRef,
  type RelatedTicketRef,
  type TaskRelationView,
  type TaskStatus,
  type TicketRelationView,
  type TicketStatus,
  type WorkRelationType,
} from '@ashniva/types';

import type {
  RelatedTaskRow,
  RelatedTicketRow,
  TaskRelationRow,
  TicketRelationRow,
} from './relations.repository';

export function ticketKeyOf(ticket: { number: number }): string {
  return `T-${ticket.number}`;
}

export function toRelatedTicket(row: RelatedTicketRow): RelatedTicketRef {
  return {
    id: row.id,
    key: ticketKeyOf(row),
    title: row.title,
    status: row.status as TicketStatus,
    priority: row.priority as Priority,
    clientOrganization: row.clientOrganization,
    assignedTo: row.assignedTo,
  };
}

export function toRelatedTask(row: RelatedTaskRow): RelatedTaskRef {
  return {
    id: row.id,
    key: `${row.project.code}-${row.number}`,
    title: row.title,
    status: row.status as TaskStatus,
    priority: row.priority as Priority,
    assignedTo: row.assignedTo,
  };
}

/**
 * One stored link, seen from the item that was asked about.
 *
 * `readable` holds only the far ends the caller could have opened directly. A far end that is not
 * in it produces `other: null` — a row that says "there is a link here" and nothing whatever about
 * what it points at. Whether even that much is shown is the service's decision and depends on who
 * is asking: a client is never shown the shape of another client's ticket, so the service drops
 * those rows entirely rather than redacting them.
 */
export function toTicketRelationView(
  row: TicketRelationRow,
  selfId: string,
  readable: Map<string, RelatedTicketRow>,
): TicketRelationView {
  const otherId = row.sourceTicketId === selfId ? row.targetTicketId : row.sourceTicketId;
  const other = readable.get(otherId);
  return {
    id: row.id,
    type: row.type as WorkRelationType,
    role: relationRole(
      {
        type: row.type as WorkRelationType,
        sourceId: row.sourceTicketId,
        targetId: row.targetTicketId,
      },
      selfId,
    ),
    note: row.note,
    linkedBy: row.linkedBy,
    linkedAt: row.linkedAt.toISOString(),
    other: other ? toRelatedTicket(other) : null,
  };
}

export function toTaskRelationView(
  row: TaskRelationRow,
  selfId: string,
  readable: Map<string, RelatedTaskRow>,
): TaskRelationView {
  const otherId = row.sourceTaskId === selfId ? row.targetTaskId : row.sourceTaskId;
  const other = readable.get(otherId);
  return {
    id: row.id,
    type: row.type as WorkRelationType,
    role: relationRole(
      {
        type: row.type as WorkRelationType,
        sourceId: row.sourceTaskId,
        targetId: row.targetTaskId,
      },
      selfId,
    ),
    note: row.note,
    linkedBy: row.linkedBy,
    linkedAt: row.linkedAt.toISOString(),
    other: other ? toRelatedTask(other) : null,
  };
}

/** The far end of a stored link, from the point of view of one of its ends. */
export function otherTicketId(row: TicketRelationRow, selfId: string): string {
  return row.sourceTicketId === selfId ? row.targetTicketId : row.sourceTicketId;
}

export function otherTaskId(row: TaskRelationRow, selfId: string): string {
  return row.sourceTaskId === selfId ? row.targetTaskId : row.sourceTaskId;
}
