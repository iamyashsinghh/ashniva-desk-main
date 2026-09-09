import type { Priority, TicketType } from '@ashniva/types';

/**
 * Inputs and outputs of the automatic ticket routing decision (Architecture Plan §19.1).
 * The service implementing it (Phase 2b) walks: module owner → primary support developer →
 * on-call developer → backup developer, skipping anyone on leave, outside working hours or at
 * their workload limit; other ticket types go to the support queue.
 */
export interface RoutingCandidate {
  userId: string;
  reason: 'MODULE_OWNER' | 'PRIMARY_DEVELOPER' | 'ON_CALL' | 'BACKUP_DEVELOPER';
}

export interface RoutingInput {
  organizationId: string;
  clientOrganizationId: string;
  projectId: string | null;
  productId: string | null;
  module: string | null;
  type: TicketType;
  priority: Priority;
  productVersion: string | null;
}

export interface RoutingDecision {
  target: 'DEVELOPER' | 'SUPPORT_QUEUE';
  assignedUserId: string | null;
  /** Every candidate considered and why they were skipped, for the audit history. */
  trail: Array<RoutingCandidate & { skipped?: 'ON_LEAVE' | 'OUT_OF_HOURS' | 'AT_WORKLOAD_LIMIT' }>;
  acknowledgeByMinutes: number;
}
