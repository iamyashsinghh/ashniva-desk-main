import type { RoutingOutcome, RoutingRole, RoutingSkipReason } from '../workflow/ticket-routing';
import type { UserRef } from './identity';

/**
 * What the API says about how a ticket came to be where it is.
 *
 * The split between `RoutingState` and `RoutingTrailRow` is a permission boundary, not a
 * convenience. The state — assigned to whom, auto or manual, acknowledged or not — is ordinary
 * ticket information. The trail names *other* people and says why each was passed over, including
 * that somebody is on leave, and that is internal: it never reaches a client response, and the
 * detail is only built for a caller holding `support-routing:manage`.
 */

/** How the current assignee got there. */
export const ASSIGNMENT_TYPE = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL: 'MANUAL',
  NONE: 'NONE',
} as const;

export type AssignmentType = (typeof ASSIGNMENT_TYPE)[keyof typeof ASSIGNMENT_TYPE];

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  AUTOMATIC: 'Routed automatically',
  MANUAL: 'Assigned by hand',
  NONE: 'Unassigned',
};

export interface RoutingState {
  ticketId: string;
  outcome: RoutingOutcome;
  assignmentType: AssignmentType;
  /** Which pass of the router produced the current state. Starts at 1. */
  attempt: number;
  policyVersion: number;
  routedAt: string | null;
  /** When the assignee has to have acknowledged by. Null once they have, or if never routed. */
  acknowledgeDueAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: UserRef | null;
  /** When the ticket escalates if nothing changes. */
  escalationDueAt: string | null;
  escalationLevel: number;
  /** Set when somebody assigned by hand: the router will not undo it on its own. */
  manualOverrideBy: UserRef | null;
  manualOverrideAt: string | null;
  manualOverrideReason: string | null;
  /** Why it is sitting in the queue, when it is. */
  queueReason: string | null;
}

/** One candidate considered, in the order they were considered. Internal only. */
export interface RoutingTrailRow {
  id: string;
  attempt: number;
  position: number;
  user: UserRef | null;
  role: RoutingRole;
  accepted: boolean;
  skipReason: RoutingSkipReason | null;
  detail: string;
  policyVersion: number;
  createdAt: string;
}

/** The whole story for one ticket, for the routing panel. */
export interface TicketRoutingDetail {
  state: RoutingState | null;
  trail: RoutingTrailRow[];
}

/** A ticket nobody is working, for the queue screen. */
export interface UnassignedTicketSummary {
  id: string;
  key: string;
  title: string;
  priority: string;
  status: string;
  project: { id: string; code: string } | null;
  module: string | null;
  clientOrganizationName: string;
  createdAt: string;
  queueReason: string | null;
}
