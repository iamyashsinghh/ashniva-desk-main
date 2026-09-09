import type {
  ChangeRequestActionAvailability,
  ChangeRequestDetail,
  ChangeRequestHistoryEntry,
  ChangeRequestStatus,
  ChangeRequestSummary,
  PortalChangeRequestDetail,
  PortalChangeRequestSummary,
} from '@ashniva/types';

import { toComment, toFile } from '../tasks/tasks.mapper';
import type { ChangeRequestDetailRow, ChangeRequestSummaryRow } from './change-requests.repository';

export function changeRequestNumber(row: { number: number }): string {
  return `CR-${String(row.number).padStart(4, '0')}`;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function money(value: { toFixed(digits: number): string } | null): string | null {
  return value ? value.toFixed(2) : null;
}

export function toChangeRequestSummary(row: ChangeRequestSummaryRow): ChangeRequestSummary {
  return {
    id: row.id,
    number: changeRequestNumber(row),
    title: row.title,
    status: row.status as ChangeRequestStatus,
    clientOrganization: row.clientOrganization,
    project: row.project,
    contract: row.contract
      ? { id: row.contract.id, number: row.contract.numberLabel, title: row.contract.title }
      : null,
    requestedBy: row.requestedBy,
    estimatedMinutes: row.estimatedMinutes,
    costImpact: money(row.costImpact),
    currency: row.currency,
    timelineImpactDays: row.timelineImpactDays,
    scheduledFor: dateOnly(row.scheduledFor),
    submittedAt: iso(row.submittedAt),
    linkedTaskCount: row._count.tasks,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toChangeRequestHistory(
  row: ChangeRequestDetailRow['history'][number],
): ChangeRequestHistoryEntry {
  return {
    id: row.id,
    fromStatus: row.fromStatus as ChangeRequestStatus | null,
    toStatus: row.toStatus as ChangeRequestStatus,
    note: row.note,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toChangeRequestDetail(
  row: ChangeRequestDetailRow,
  actions: ChangeRequestActionAvailability[],
  options: { includeInternalComments: boolean },
): ChangeRequestDetail {
  return {
    ...toChangeRequestSummary(row),
    description: row.description,
    businessReason: row.businessReason,
    scope: row.scope,
    impact: row.impact,
    internalNotes: row.internalNotes,
    decisionNote: row.decisionNote,
    approvedAt: iso(row.approvedAt),
    completedAt: iso(row.completedAt),
    comments: row.comments
      .filter((comment) => options.includeInternalComments || comment.visibility === 'CLIENT')
      .map(toComment),
    files: row.files.map(toFile),
    linkedTasks: row.tasks.map((task) => ({
      id: task.id,
      key: `${task.project.code}-${task.number}`,
      title: task.title,
      status: task.status,
    })),
    milestones: row.milestones,
    history: row.history.map(toChangeRequestHistory),
    actions,
    createdBy: row.createdBy,
  };
}

/** Portal allow-list: no internal notes, no internal comments, no internal files. */
export function toPortalChangeRequestSummary(
  row: ChangeRequestSummaryRow,
): PortalChangeRequestSummary {
  return {
    id: row.id,
    number: changeRequestNumber(row),
    title: row.title,
    status: row.status as ChangeRequestStatus,
    project: row.project,
    requestedBy: row.requestedBy,
    estimatedMinutes: row.estimatedMinutes,
    costImpact: money(row.costImpact),
    currency: row.currency,
    timelineImpactDays: row.timelineImpactDays,
    scheduledFor: dateOnly(row.scheduledFor),
    submittedAt: iso(row.submittedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPortalChangeRequestDetail(
  row: ChangeRequestDetailRow,
  can: { approve: boolean; requestChanges: boolean; reply: boolean },
): PortalChangeRequestDetail {
  return {
    ...toPortalChangeRequestSummary(row),
    description: row.description,
    businessReason: row.businessReason,
    scope: row.scope,
    impact: row.impact,
    decisionNote: row.decisionNote,
    comments: row.comments.filter((comment) => comment.visibility === 'CLIENT').map(toComment),
    files: row.files.filter((file) => file.visibility === 'CLIENT').map(toFile),
    history: row.history.map(toChangeRequestHistory),
    canApprove: can.approve,
    canRequestChanges: can.requestChanges,
    canReply: can.reply,
  };
}
