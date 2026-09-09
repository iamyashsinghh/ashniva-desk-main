import type { Priority } from '../domain/priority';
import type { SlaEventKind, SlaTargetStatus } from '../workflow/sla-status';
import type { TicketStatus } from '../workflow/ticket-status';

export interface SlaPolicyRule {
  priority: Priority;
  /** Business minutes until the first public reply is due. */
  firstResponseMinutes: number;
  /** Business minutes until the ticket must be resolved. */
  resolutionMinutes: number;
}

export interface SlaPolicySummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  timezone: string;
  /** "09:00" */
  businessHoursStart: string;
  /** "18:00" */
  businessHoursEnd: string;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  businessDays: number[];
  /** Ticket statuses that stop the clocks. */
  pauseStatuses: TicketStatus[];
  /** Percentage of the target after which the ticket is "at risk". */
  warningPercent: number;
  rules: SlaPolicyRule[];
  /** Policy scope: a client organization, a project, or the default for everything else. */
  clientOrganization: { id: string; name: string } | null;
  project: { id: string; code: string; name: string } | null;
  ticketCount: number;
  createdAt: string;
  updatedAt: string;
  /**
   * What saving this policy did to the open tickets it now governs.
   *
   * Only present on the response to a create or an update — a list or a read has reapplied
   * nothing. `truncated` says the sweep stopped at its ceiling and some open tickets still carry
   * their previous policy, which is the difference between "5000 tickets were reapplied" and
   * "5000 of your 6000 tickets were reapplied"; without it both read as complete.
   */
  reapply?: SlaReapplyResult;
}

/** How far a policy change got through the open tickets it applies to. */
export interface SlaReapplyResult {
  /** Open tickets whose clocks were rewritten. */
  changed: number;
  /** True when the sweep stopped at its ceiling before it ran out of tickets. */
  truncated: boolean;
}

export interface SlaTargetState {
  status: SlaTargetStatus;
  dueAt: string | null;
  warnAt: string | null;
  /** When the target was reached (first public reply / resolution). */
  metAt: string | null;
  /** Wall-clock minutes left (negative when breached); null when paused or not applicable. */
  remainingMinutes: number | null;
}

/** SLA block on a ticket; computed on the backend, the browser only renders it. */
export interface TicketSla {
  policy: { id: string; name: string } | null;
  firstResponse: SlaTargetState;
  resolution: SlaTargetState;
  isPaused: boolean;
  pausedSince: string | null;
  pausedTotalMinutes: number;
  /** Worst of the two targets, for list badges. */
  overall: SlaTargetStatus;
}

export interface SlaEventSummary {
  id: string;
  kind: SlaEventKind;
  detail: string | null;
  createdAt: string;
}
