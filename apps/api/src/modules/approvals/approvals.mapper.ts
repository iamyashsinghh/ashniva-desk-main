import type {
  ApprovalActionAvailability,
  ApprovalDetail,
  ApprovalHistoryEntry,
  ApprovalStatus,
  ApprovalSubjectRef,
  ApprovalSubjectType,
  ApprovalSummary,
  PortalApprovalDetail,
  PortalApprovalSummary,
} from '@ashniva/types';

import { toFile } from '../tasks/tasks.mapper';
import type { ApprovalDetailRow, ApprovalSummaryRow } from './approvals.repository';

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function isApprovalOverdue(row: ApprovalSummaryRow, today = new Date()): boolean {
  return (
    row.status === 'PUBLISHED' &&
    row.dueDate !== null &&
    row.dueDate.getTime() < new Date(today.toISOString().slice(0, 10)).getTime()
  );
}

/** Subject reference with a label and, when known, the internal / portal route. */
export function toSubjectRef(
  row: ApprovalSummaryRow,
  label: string,
  audience: 'internal' | 'portal',
): ApprovalSubjectRef {
  const type = row.subjectType as ApprovalSubjectType;
  const prefix = audience === 'portal' ? '/portal' : '';
  const links: Record<ApprovalSubjectType, string | null> = {
    CLIENT_UPDATE: row.projectId ? `${prefix}/projects/${row.projectId}` : null,
    MILESTONE: row.projectId ? `${prefix}/projects/${row.projectId}` : null,
    CONTRACT_DOCUMENT: row.contractId ? `${prefix}/contracts/${row.contractId}` : null,
    CHANGE_REQUEST: row.changeRequest ? `${prefix}/change-requests/${row.changeRequest.id}` : null,
    FILE: null,
  };
  return { type, id: row.subjectId, label, link: links[type] };
}

export function toApprovalSummary(row: ApprovalSummaryRow, subjectLabel: string): ApprovalSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ApprovalStatus,
    subject: toSubjectRef(row, subjectLabel, 'internal'),
    clientOrganization: row.clientOrganization,
    project: row.project,
    contract: row.contract
      ? { id: row.contract.id, number: row.contract.numberLabel, title: row.contract.title }
      : null,
    requestedBy: row.requestedBy,
    publishedAt: iso(row.publishedAt),
    dueDate: dateOnly(row.dueDate),
    decidedBy: row.decidedBy,
    decidedAt: iso(row.decidedAt),
    isOverdue: isApprovalOverdue(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toApprovalHistory(row: ApprovalDetailRow['history'][number]): ApprovalHistoryEntry {
  return {
    id: row.id,
    fromStatus: row.fromStatus as ApprovalStatus | null,
    toStatus: row.toStatus as ApprovalStatus,
    comment: row.comment,
    actor: row.actor,
    side: row.side,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toApprovalDetail(
  row: ApprovalDetailRow,
  subjectLabel: string,
  actions: ApprovalActionAvailability[],
): ApprovalDetail {
  return {
    ...toApprovalSummary(row, subjectLabel),
    summary: row.summary,
    internalNotes: row.internalNotes,
    internalReviewer: row.internalReviewer,
    internalReviewedAt: iso(row.internalReviewedAt),
    publishedBy: row.publishedBy,
    decisionComment: row.decisionComment,
    files: row.files.map(toFile),
    history: row.history.map(toApprovalHistory),
    actions,
  };
}

/** Portal allow-list: no internal notes, reviewer, or internal-side history comments. */
export function toPortalApprovalSummary(
  row: ApprovalSummaryRow,
  subjectLabel: string,
): PortalApprovalSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ApprovalStatus,
    subject: toSubjectRef(row, subjectLabel, 'portal'),
    project: row.project,
    publishedAt: iso(row.publishedAt),
    dueDate: dateOnly(row.dueDate),
    decidedBy: row.decidedBy,
    decidedAt: iso(row.decidedAt),
    isOverdue: isApprovalOverdue(row),
  };
}

export function toPortalApprovalDetail(
  row: ApprovalDetailRow,
  subjectLabel: string,
  canDecide: boolean,
): PortalApprovalDetail {
  return {
    ...toPortalApprovalSummary(row, subjectLabel),
    summary: row.summary,
    decisionComment: row.decisionComment,
    files: row.files.filter((file) => file.visibility === 'CLIENT').map(toFile),
    history: row.history
      .filter((entry) => entry.toStatus !== 'DRAFT' && entry.toStatus !== 'INTERNAL_REVIEW')
      .map((entry) => ({
        ...toApprovalHistory(entry),
        comment: entry.side === 'CLIENT' || entry.toStatus === 'PUBLISHED' ? entry.comment : null,
      })),
    canDecide,
  };
}
