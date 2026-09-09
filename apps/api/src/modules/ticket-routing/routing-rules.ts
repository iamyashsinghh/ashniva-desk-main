import { TICKET_STATUS, type RoutingPlan, type TicketStatus } from '@ashniva/types';

import type { RoutingConfig } from './routing-candidates.service';
import type { TrailInput } from './ticket-routing.repository';

/**
 * The router's own small rules: which statuses it may act on, and how a plan becomes rows.
 *
 * Split out of the service so that the service reads as the sequence it is — gather, claim, apply,
 * record — rather than as that sequence with three unrelated helpers wedged into it. Nothing here
 * touches a database or a queue, so it can be read and tested on its own.
 */

/** Statuses the router may act on unasked. Work already under way is not re-routed by a machine. */
export const ROUTABLE: readonly TicketStatus[] = [
  TICKET_STATUS.NEW,
  TICKET_STATUS.REOPENED,
  TICKET_STATUS.AUTO_ASSIGNED,
  TICKET_STATUS.ESCALATED,
];

/**
 * The extra statuses a *forced* re-route may act on.
 *
 * A manual assignment leaves the ticket ASSIGNED, so without these a forced re-route could never
 * do the one thing `force` exists for. It still stops short of work in progress: putting a ticket
 * on somebody else while a developer is mid-fix is a decision for a person, not a flag.
 */
export const FORCE_ROUTABLE: readonly TicketStatus[] = [
  ...ROUTABLE,
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.ACKNOWLEDGED,
];

/**
 * Whether this ticket type goes straight to a developer.
 *
 * An empty list means the project never configured one, and the safe reading of that is "route
 * everything" rather than "route nothing": a project that set up support ownership and left the
 * type list alone meant the router to be used. A non-empty list is taken literally.
 */
/**
 * The statuses an acknowledgement moves a ticket out of. Everything else it merely records.
 *
 * Here rather than in the service for the same reason `ROUTABLE` is: these three lists are one
 * answer to "which statuses may a machine act on", and splitting them across two files is how
 * they drift apart.
 */
export const ACKNOWLEDGEABLE: readonly TicketStatus[] = [
  TICKET_STATUS.AUTO_ASSIGNED,
  TICKET_STATUS.ASSIGNED,
  TICKET_STATUS.ESCALATED,
];

export function isDirectType(config: RoutingConfig, type: string): boolean {
  if (config.directTypes.length === 0) {
    return true;
  }
  return config.directTypes.some((entry) => entry.toUpperCase() === type.toUpperCase());
}

export function toTrailRows(plan: RoutingPlan, attempt: number): TrailInput[] {
  return plan.trail.map((entry) => ({
    attempt,
    position: entry.position,
    candidateUserId: entry.userId,
    role: entry.role,
    accepted: entry.accepted,
    skipReason: entry.skipReason,
    detail: entry.detail,
    policyVersion: plan.policyVersion,
  }));
}
