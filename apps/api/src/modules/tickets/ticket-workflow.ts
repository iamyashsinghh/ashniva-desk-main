import { ConflictException, ForbiddenException } from '@nestjs/common';
import {
  PERMISSIONS,
  TICKET_ACTION,
  TICKET_STATUS,
  TICKET_STATUS_LABELS,
  canTransitionTicket,
  isClientRole,
  type AuthenticatedUser,
  type TicketAction,
  type TicketActionAvailability,
  type TicketStatus,
} from '@ashniva/types';

export interface WorkflowTicket {
  status: TicketStatus;
  requesterId: string;
  assignedToId: string | null;
  clientOrganizationId: string;
}

type Actor = Pick<
  AuthenticatedUser,
  'userId' | 'organizationId' | 'roleKey' | 'permissions' | 'isServiceProvider'
>;

const S = TICKET_STATUS;
const A = TICKET_ACTION;

export const TICKET_ACTION_TARGET: Partial<Record<TicketAction, TicketStatus>> = {
  [A.START]: S.IN_PROGRESS,
  [A.WAIT_CLIENT]: S.WAITING_CLIENT,
  [A.RESUME]: S.IN_PROGRESS,
  [A.REVIEW]: S.REVIEW,
  [A.RESOLVE]: S.RESOLVED,
  [A.CLOSE]: S.CLOSED,
  [A.REOPEN]: S.REOPENED,
  [A.CANCEL]: S.CANCELLED,
};

function has(actor: Actor, permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]): boolean {
  return actor.permissions.includes(permission);
}

function isInternal(actor: Actor): boolean {
  return actor.isServiceProvider && !isClientRole(actor.roleKey);
}

function isRequesterSide(ticket: WorkflowTicket, actor: Actor): boolean {
  return !isInternal(actor) && actor.organizationId === ticket.clientOrganizationId;
}

function isAssignee(ticket: WorkflowTicket, actor: Actor): boolean {
  return ticket.assignedToId !== null && ticket.assignedToId === actor.userId;
}

function canTriage(actor: Actor): boolean {
  return isInternal(actor) && has(actor, PERMISSIONS.TICKET_TRIAGE);
}

function canWork(ticket: WorkflowTicket, actor: Actor): boolean {
  return isInternal(actor) && (isAssignee(ticket, actor) || canTriage(actor));
}

/**
 * Who may do what on a ticket:
 *  - support / managers (ticket:triage) assign, convert, cancel and drive any ticket;
 *  - the assigned person works it (start, wait for client, resume, review, resolve);
 *  - the requester's organization replies publicly, confirms closure and reopens;
 *  - internal notes need comment:internal; public replies need ticket:reply-public.
 */
export function explainTicketAction(
  ticket: WorkflowTicket,
  actor: Actor,
  action: TicketAction,
): TicketActionAvailability {
  const disabled = (reason: string): TicketActionAvailability => ({
    action,
    enabled: false,
    reason,
  });
  const label = TICKET_STATUS_LABELS[ticket.status].toLowerCase();
  const target = TICKET_ACTION_TARGET[action];
  if (target && !canTransitionTicket(ticket.status, target)) {
    return disabled(`Not available while the ticket is ${label}`);
  }
  const closed =
    ticket.status === S.RESOLVED || ticket.status === S.CLOSED || ticket.status === S.CANCELLED;

  switch (action) {
    case A.ASSIGN:
      if (closed) {
        return disabled('Closed tickets cannot be assigned');
      }
      if (!canTriage(actor) && !(isInternal(actor) && has(actor, PERMISSIONS.TICKET_REASSIGN))) {
        return disabled('Only support or a manager can assign tickets');
      }
      return { action, enabled: true };
    case A.CONVERT:
      if (closed) {
        return disabled('Closed tickets cannot be converted');
      }
      if (!canTriage(actor)) {
        return disabled('Only support or a manager can convert a ticket into tasks');
      }
      return { action, enabled: true };
    case A.CANCEL:
      if (!canTriage(actor)) {
        return disabled('Only support or a manager can cancel tickets');
      }
      return { action, enabled: true };
    case A.START:
    case A.WAIT_CLIENT:
    case A.RESUME:
    case A.REVIEW:
      if (!canWork(ticket, actor)) {
        return disabled('Only the assigned person or support can do this');
      }
      return { action, enabled: true };
    case A.RESOLVE:
      if (
        !canWork(ticket, actor) &&
        !(isInternal(actor) && has(actor, PERMISSIONS.TICKET_RESOLVE))
      ) {
        return disabled('Only the assigned person or support can resolve');
      }
      return { action, enabled: true };
    case A.CLOSE:
      if (
        !isRequesterSide(ticket, actor) &&
        !(isInternal(actor) && has(actor, PERMISSIONS.TICKET_RESOLVE))
      ) {
        return disabled('Only the requester or support can close');
      }
      return { action, enabled: true };
    case A.REOPEN:
      if (
        !isRequesterSide(ticket, actor) &&
        !canTriage(actor) &&
        !(isInternal(actor) && has(actor, PERMISSIONS.TICKET_RESOLVE))
      ) {
        return disabled('Only the requester or support can reopen');
      }
      return { action, enabled: true };
    case A.REPLY_PUBLIC:
      if (ticket.status === S.CANCELLED) {
        return disabled('Cancelled tickets are read-only');
      }
      if (!has(actor, PERMISSIONS.TICKET_REPLY_PUBLIC)) {
        return disabled('Your role cannot reply on tickets');
      }
      if (!isInternal(actor) && !isRequesterSide(ticket, actor)) {
        return disabled('This ticket belongs to another organization');
      }
      return { action, enabled: true };
    case A.NOTE_INTERNAL:
      if (!isInternal(actor) || !has(actor, PERMISSIONS.COMMENT_INTERNAL)) {
        return disabled('Internal notes are for staff only');
      }
      return { action, enabled: true };
    default:
      return disabled('Unknown action');
  }
}

export function listTicketActions(
  ticket: WorkflowTicket,
  actor: Actor,
): TicketActionAvailability[] {
  return Object.values(A).map((action) => explainTicketAction(ticket, actor, action));
}

export function assertTicketAction(
  ticket: WorkflowTicket,
  actor: Actor,
  action: TicketAction,
): void {
  const availability = explainTicketAction(ticket, actor, action);
  if (availability.enabled) {
    return;
  }
  const target = TICKET_ACTION_TARGET[action];
  if (target && !canTransitionTicket(ticket.status, target)) {
    throw new ConflictException(availability.reason);
  }
  throw new ForbiddenException(availability.reason);
}
