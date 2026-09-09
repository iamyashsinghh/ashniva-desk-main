import type {
  ProjectReleasePolicySummary,
  ReleaseApprovalDecision,
  ReleaseApprovalRow,
  ReleaseApproverRole,
  ReleaseDetail,
  ReleaseHistoryRow,
  ReleaseItemKind,
  ReleaseItemRow,
  ReleaseReadiness,
  ReleaseStatus,
  ReleaseSummary,
  TestEnvironment,
} from '@ashniva/types';

import { changeRequestNumber } from '../change-requests/change-requests.mapper';
import { taskKey } from '../tasks/tasks.mapper';
import { ticketKey } from '../tickets/tickets.mapper';
import type { ProjectReleasePolicyRow } from './release-gates.repository';
import type { ReleaseDetailRow, ReleaseSummaryRow } from './releases.repository';

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toReleaseSummary(row: ReleaseSummaryRow): ReleaseSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    version: row.version,
    title: row.title,
    status: row.status as ReleaseStatus,
    environment: row.environment as TestEnvironment,
    itemCount: row._count.items,
    scheduledFor: iso(row.scheduledFor),
    publishedAt: iso(row.publishedAt),
    verifiedAt: iso(row.verifiedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The reference is the label the person recognises — the task key on the board, the ticket number
 * they were given on the phone. An item whose target has since been deleted keeps its row and
 * says so, rather than dropping silently out of what a release contained.
 */
export function toReleaseItem(row: ReleaseDetailRow['items'][number]): ReleaseItemRow {
  const target = itemTarget(row);
  return {
    id: row.id,
    kind: row.kind as ReleaseItemKind,
    taskId: row.taskId,
    ticketId: row.ticketId,
    changeRequestId: row.changeRequestId,
    reference: target.reference,
    title: target.title,
    position: row.position,
  };
}

function itemTarget(row: ReleaseDetailRow['items'][number]): { reference: string; title: string } {
  if (row.task) {
    return { reference: taskKey(row.task), title: row.task.title };
  }
  if (row.ticket) {
    return { reference: ticketKey(row.ticket), title: row.ticket.title };
  }
  if (row.changeRequest) {
    return {
      reference: changeRequestNumber(row.changeRequest),
      title: row.changeRequest.title,
    };
  }
  return { reference: '—', title: 'Removed' };
}

export function toReleaseApproval(row: ReleaseDetailRow['approvals'][number]): ReleaseApprovalRow {
  return {
    id: row.id,
    approverRole: row.approverRole as ReleaseApproverRole,
    decision: row.decision as ReleaseApprovalDecision,
    approverUserId: row.approverUserId,
    approverName: row.approver?.name ?? null,
    note: row.note,
    decidedAt: iso(row.decidedAt),
  };
}

export function toReleaseHistory(row: ReleaseDetailRow['history'][number]): ReleaseHistoryRow {
  return {
    id: row.id,
    fromStatus: row.fromStatus as ReleaseStatus | null,
    toStatus: row.toStatus as ReleaseStatus,
    note: row.note,
    changedByName: row.changedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toReleaseDetail(row: ReleaseDetailRow, readiness: ReleaseReadiness): ReleaseDetail {
  return {
    ...toReleaseSummary(row),
    notes: row.notes,
    publishedByName: row.publishedBy?.name ?? null,
    rolledBackAt: iso(row.rolledBackAt),
    rollbackReason: row.rollbackReason,
    failureReason: row.failureReason,
    releaseNoteId: row.releaseNoteId,
    items: row.items.map(toReleaseItem),
    approvals: row.approvals.map(toReleaseApproval),
    history: row.history.map(toReleaseHistory),
    readiness,
  };
}

export function toPolicySummary(row: ProjectReleasePolicyRow): ProjectReleasePolicySummary {
  return {
    projectId: row.projectId,
    approverRoles: row.approverRoles as ReleaseApproverRole[],
    requiresQaPass: row.requiresQaPass,
    requiresClientUat: row.requiresClientUat,
    requiresLiveVerification: row.requiresLiveVerification,
    requiresTypedConfirmation: row.requiresTypedConfirmation,
  };
}
