/**
 * Ticket workflow states (Architecture Plan §19.1).
 *
 * Phase 1 workflow:
 *   NEW → ASSIGNED → IN_PROGRESS → WAITING_CLIENT → REVIEW → RESOLVED → CLOSED
 * with REOPENED and CANCELLED as side states.
 *
 * Package 8b adds the smart-support path alongside it, which is what AUTO_ASSIGNED, ACKNOWLEDGED
 * and ESCALATED were reserved for:
 *   NEW → AUTO_ASSIGNED → ACKNOWLEDGED → IN_PROGRESS → … and, on a timer, → ESCALATED
 *
 * The two paths rejoin at IN_PROGRESS rather than running in parallel. A ticket a person assigned
 * by hand is still ASSIGNED — the distinction between the two is exactly the point, because it is
 * what tells a manager whether the router chose the assignee or somebody did.
 */
export const TICKET_STATUS = {
  NEW: 'NEW',
  AUTO_ASSIGNED: 'AUTO_ASSIGNED',
  ASSIGNED: 'ASSIGNED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_CLIENT: 'WAITING_CLIENT',
  ESCALATED: 'ESCALATED',
  REVIEW: 'REVIEW',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  REOPENED: 'REOPENED',
  CANCELLED: 'CANCELLED',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

export const ALL_TICKET_STATUSES: readonly TicketStatus[] = Object.values(TICKET_STATUS);

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  NEW: 'New',
  AUTO_ASSIGNED: 'Auto-assigned',
  ASSIGNED: 'Assigned',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In progress',
  WAITING_CLIENT: 'Waiting for client',
  ESCALATED: 'Escalated',
  REVIEW: 'Review / testing',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

/** States a ticket can be in, in display order. */
export const PHASE1_TICKET_STATUSES: readonly TicketStatus[] = [
  TICKET_STATUS.NEW,
  TICKET_STATUS.AUTO_ASSIGNED,
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.ACKNOWLEDGED,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.WAITING_CLIENT,
  TICKET_STATUS.ESCALATED,
  TICKET_STATUS.REVIEW,
  TICKET_STATUS.RESOLVED,
  TICKET_STATUS.CLOSED,
  TICKET_STATUS.REOPENED,
  TICKET_STATUS.CANCELLED,
];

/**
 * The statuses a ticket reaches through automatic routing rather than through a person.
 *
 * Useful to a screen that wants to say "the router put it here", and to the monitor, which only
 * ever looks at tickets sitting in one of these.
 */
export const ROUTED_TICKET_STATUSES: readonly TicketStatus[] = [
  TICKET_STATUS.AUTO_ASSIGNED,
  TICKET_STATUS.ACKNOWLEDGED,
  TICKET_STATUS.ESCALATED,
];

/**
 * Allowed transitions. Assigning an already-assigned ticket to someone else keeps the status
 * (reassignment is recorded in the activity history, not as a status change).
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: [TICKET_STATUS.AUTO_ASSIGNED, TICKET_STATUS.ASSIGNED, TICKET_STATUS.CANCELLED],
  ASSIGNED: [
    TICKET_STATUS.ACKNOWLEDGED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.WAITING_CLIENT,
    TICKET_STATUS.ESCALATED,
    // A manager may put a hand-assigned ticket back onto the automatic path — that is what a
    // forced re-route is for, and `FORCE_ROUTABLE` in the router has always admitted ASSIGNED.
    TICKET_STATUS.AUTO_ASSIGNED,
    TICKET_STATUS.CANCELLED,
  ],
  IN_PROGRESS: [
    TICKET_STATUS.WAITING_CLIENT,
    TICKET_STATUS.REVIEW,
    TICKET_STATUS.RESOLVED,
    TICKET_STATUS.ESCALATED,
    TICKET_STATUS.CANCELLED,
  ],
  // Deliberately no edge to ESCALATED from either of these, although the escalation timer does
  // reach tickets sitting in both. What a status says is what the ticket is waiting for, and
  // ESCALATED would overwrite that: a ticket parked on the client would stop reading as parked on
  // the client — to the support desk and, through the client-visible mapping, to the client — and
  // a ticket in review would lose the fact that somebody is reviewing it. The escalation still
  // happens in every way that matters, on the ticket's activity trail rather than its status;
  // `RoutingEscalationService.escalate` is where that choice is made.
  WAITING_CLIENT: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.RESOLVED, TICKET_STATUS.CANCELLED],
  REVIEW: [TICKET_STATUS.RESOLVED, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELLED],
  RESOLVED: [TICKET_STATUS.CLOSED, TICKET_STATUS.REOPENED],
  CLOSED: [TICKET_STATUS.REOPENED],
  REOPENED: [
    TICKET_STATUS.AUTO_ASSIGNED,
    TICKET_STATUS.ASSIGNED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.CANCELLED,
  ],
  CANCELLED: [],

  // Smart support routing (package 8b).
  //
  // AUTO_ASSIGNED is where the router leaves a ticket, and it is a waiting state: the assignee has
  // `ackMinutes` to acknowledge. It can therefore move on by acknowledgement, by somebody starting
  // work directly, by a manager reassigning it, by re-routing to the next candidate, or by the
  // timer escalating it — and every one of those is a real thing that happens.
  AUTO_ASSIGNED: [
    TICKET_STATUS.ACKNOWLEDGED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.ASSIGNED,
    TICKET_STATUS.AUTO_ASSIGNED,
    TICKET_STATUS.ESCALATED,
    TICKET_STATUS.CANCELLED,
  ],
  ACKNOWLEDGED: [
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.WAITING_CLIENT,
    TICKET_STATUS.ASSIGNED,
    TICKET_STATUS.ESCALATED,
    // Same reason as ASSIGNED above: acknowledging is not a commitment nobody can undo, and a
    // forced re-route may take the ticket off somebody who acknowledged it and then went quiet.
    TICKET_STATUS.AUTO_ASSIGNED,
    TICKET_STATUS.CANCELLED,
  ],
  // An escalated ticket is not a dead end: it goes back into the chain, to a person, or forward
  // into the work. What it must never do is vanish.
  ESCALATED: [
    TICKET_STATUS.AUTO_ASSIGNED,
    TICKET_STATUS.ASSIGNED,
    TICKET_STATUS.ACKNOWLEDGED,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.WAITING_CLIENT,
    TICKET_STATUS.RESOLVED,
    TICKET_STATUS.CANCELLED,
  ],
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus): boolean {
  return TICKET_TRANSITIONS[from].includes(to);
}

export const CLOSED_TICKET_STATUSES: readonly TicketStatus[] = [
  TICKET_STATUS.RESOLVED,
  TICKET_STATUS.CLOSED,
  TICKET_STATUS.CANCELLED,
];

export const OPEN_TICKET_STATUSES: readonly TicketStatus[] = ALL_TICKET_STATUSES.filter(
  (status) => !CLOSED_TICKET_STATUSES.includes(status),
);

export function isTicketClosed(status: TicketStatus): boolean {
  return CLOSED_TICKET_STATUSES.includes(status);
}
