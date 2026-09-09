import type { UatCommentRow, UatRequestDetail, UatRequestSummary } from '@ashniva/types';

import type { UatCommentRowData, UatRequestDetailRow, UatRequestRow } from './uat.repository';

/**
 * UAT responses, built field by field.
 *
 * These are the client-facing shapes, so the rule is absolute: every field is written out by
 * name, never spread from a row. There is no staging URL here, no test account, no pull request,
 * no internal note and nothing belonging to another client — not because the query happens not to
 * fetch them today, but because the only way one could appear is for somebody to add a line to
 * this file.
 *
 * One set of mappers serves the internal and the portal routes on purpose. Every field below is
 * one a client may read, so a second "safe" copy would only be the same list written twice — and
 * two lists drift. What differs between the two sides is the *scope* of the query, which the
 * portal service pins to the caller's own organization.
 */

export function toUatRequestSummary(row: UatRequestRow): UatRequestSummary {
  return {
    id: row.id,
    releaseId: row.releaseId,
    taskId: row.taskId,
    summaryPlain: row.summaryPlain,
    previewUrl: row.previewUrl,
    checklist: row.checklist,
    status: row.status,
    note: row.note,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decidedByName: row.decidedBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUatRequestDetail(row: UatRequestDetailRow): UatRequestDetail {
  return {
    ...toUatRequestSummary(row),
    // The client's own organization on a portal read — the query cannot return anybody else's.
    clientOrganizationId: row.clientOrganizationId,
    clientName: row.clientOrganization.name,
    releaseVersion: row.release?.version ?? null,
    createdByName: row.createdBy.name,
    comments: row.comments.map(toUatCommentRow),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toUatCommentRow(row: UatCommentRowData): UatCommentRow {
  return {
    id: row.id,
    body: row.body,
    authorName: row.author.name,
    // Stored on the row, not derived from the author's memberships, which change.
    fromClient: row.fromClient,
    createdAt: row.createdAt.toISOString(),
  };
}
