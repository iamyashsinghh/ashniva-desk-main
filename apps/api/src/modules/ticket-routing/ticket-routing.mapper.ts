import type {
  AssignmentType,
  RoutingOutcome,
  RoutingRole,
  RoutingSkipReason,
  RoutingState,
  RoutingTrailRow,
} from '@ashniva/types';

import type { RoutingStateRow, RoutingTrailRowModel } from './ticket-routing.repository';

export function toRoutingState(row: RoutingStateRow): RoutingState {
  return {
    ticketId: row.ticketId,
    outcome: row.outcome as RoutingOutcome,
    assignmentType: row.assignmentType as AssignmentType,
    attempt: row.attempt,
    policyVersion: row.policyVersion,
    routedAt: row.routedAt?.toISOString() ?? null,
    acknowledgeDueAt: row.acknowledgeDueAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy,
    escalationDueAt: row.escalationDueAt?.toISOString() ?? null,
    escalationLevel: row.escalationLevel,
    manualOverrideBy: row.manualOverrideBy,
    manualOverrideAt: row.manualOverrideAt?.toISOString() ?? null,
    manualOverrideReason: row.manualOverrideReason,
    queueReason: row.queueReason,
  };
}

export function toRoutingTrailRow(row: RoutingTrailRowModel): RoutingTrailRow {
  return {
    id: row.id,
    attempt: row.attempt,
    position: row.position,
    user: row.candidateUser,
    role: row.role as RoutingRole,
    accepted: row.accepted,
    skipReason: (row.skipReason as RoutingSkipReason | null) ?? null,
    detail: row.detail,
    policyVersion: row.policyVersion,
    createdAt: row.createdAt.toISOString(),
  };
}
