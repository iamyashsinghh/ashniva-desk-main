import { TICKET_STATUS, type TicketStatus } from './ticket-status';

/** State of one SLA target (first response or resolution) on a ticket. */
export const SLA_TARGET_STATUS = {
  /** No policy applies. */
  NONE: 'NONE',
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  BREACHED: 'BREACHED',
  PAUSED: 'PAUSED',
  /** The target was reached in time. */
  MET: 'MET',
  /** The target was reached, but late. */
  MET_LATE: 'MET_LATE',
} as const;

export type SlaTargetStatus = (typeof SLA_TARGET_STATUS)[keyof typeof SLA_TARGET_STATUS];

export const SLA_TARGET_STATUS_LABELS: Record<SlaTargetStatus, string> = {
  NONE: 'No SLA',
  ON_TRACK: 'On track',
  AT_RISK: 'At risk',
  BREACHED: 'Breached',
  PAUSED: 'Paused',
  MET: 'Met',
  MET_LATE: 'Met late',
};

/** Ticket statuses that stop every SLA clock by default (the policy can change the list). */
export const DEFAULT_SLA_PAUSE_STATUSES: readonly TicketStatus[] = [TICKET_STATUS.WAITING_CLIENT];

/** Ticket statuses after which resolution counts as reached. */
export const SLA_RESOLVED_STATUSES: readonly TicketStatus[] = [
  TICKET_STATUS.RESOLVED,
  TICKET_STATUS.CLOSED,
];

export const SLA_EVENT_KIND = {
  STARTED: 'STARTED',
  PAUSED: 'PAUSED',
  RESUMED: 'RESUMED',
  FIRST_RESPONSE_MET: 'FIRST_RESPONSE_MET',
  RESOLUTION_MET: 'RESOLUTION_MET',
  FIRST_RESPONSE_WARNING: 'FIRST_RESPONSE_WARNING',
  FIRST_RESPONSE_BREACHED: 'FIRST_RESPONSE_BREACHED',
  RESOLUTION_WARNING: 'RESOLUTION_WARNING',
  RESOLUTION_BREACHED: 'RESOLUTION_BREACHED',
  RECALCULATED: 'RECALCULATED',
  POLICY_CHANGED: 'POLICY_CHANGED',
} as const;

export type SlaEventKind = (typeof SLA_EVENT_KIND)[keyof typeof SLA_EVENT_KIND];

export const SLA_EVENT_KIND_LABELS: Record<SlaEventKind, string> = {
  STARTED: 'SLA clock started',
  PAUSED: 'Clock paused',
  RESUMED: 'Clock resumed',
  FIRST_RESPONSE_MET: 'First response recorded',
  RESOLUTION_MET: 'Resolved',
  FIRST_RESPONSE_WARNING: 'First response at risk',
  FIRST_RESPONSE_BREACHED: 'First response breached',
  RESOLUTION_WARNING: 'Resolution at risk',
  RESOLUTION_BREACHED: 'Resolution breached',
  RECALCULATED: 'Targets recalculated',
  POLICY_CHANGED: 'Policy changed',
};
