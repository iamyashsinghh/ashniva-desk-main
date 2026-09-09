import type {
  AiGenerationRunSummary,
  AiSummaryDetail,
  AiSummaryListRow,
  AiSummarySourceRef,
  AiSummaryVersionDetail,
  AiSummaryVersionRef,
} from '@ashniva/types';

import type { AiSummaryDetailRow, AiSummaryListRowData } from './ai-summaries.repository';

/**
 * The internal shapes.
 *
 * Allow-lists rather than spreads, so a new column on `ai_summaries` — a stored prompt, say —
 * cannot appear in a response because someone forgot it was there.
 */

export function toListRow(row: AiSummaryListRowData): AiSummaryListRow {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    projectId: row.projectId,
    projectCode: row.project?.code ?? null,
    subjectUserId: row.subjectUserId,
    subjectUserName: row.subjectUser?.name ?? null,
    periodStart: day(row.periodStart),
    periodEnd: day(row.periodEnd),
    sourceCount: row._count.sources,
    version: row.version,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toDetail(row: AiSummaryDetailRow): AiSummaryDetail {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    projectId: row.projectId,
    projectCode: row.project?.code ?? null,
    subjectUserId: row.subjectUserId,
    subjectUserName: row.subjectUser?.name ?? null,
    periodStart: day(row.periodStart),
    periodEnd: day(row.periodEnd),
    sourceCount: row.sources.length,
    version: row.version,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    clientOrganizationId: row.clientOrganizationId,
    clientOrganizationName: row.clientOrganization?.name ?? null,
    ticketId: row.ticketId,
    internalContent: row.internalContent,
    clientContent: row.clientContent,
    missingDataNote: row.missingDataNote,
    reviewNote: row.reviewNote,
    cancelReason: row.cancelReason,
    isDraftOutput: row.isDraftOutput,
    providerName: row.providerName,
    model: row.model,
    promptVersion: row.promptVersion,
    outputVersion: row.outputVersion,
    approvedByName: row.approvedBy?.name ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    publishedByName: row.publishedBy?.name ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    sources: row.sources.map(toSourceRef),
    versions: row.versions.map(toVersionRef),
    runs: row.runs.map(toRunSummary),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * A source, without the prompt text.
 *
 * `promptText` is the sanitised body that went to the provider. It is available on the source
 * inspection endpoint, which is a separate, deliberate request — not something every detail read
 * carries around.
 */
function toSourceRef(row: AiSummaryDetailRow['sources'][number]): AiSummarySourceRef {
  return {
    id: row.id,
    kind: row.kind,
    refId: row.refId,
    label: row.label,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    clientVisible: row.clientVisible,
  };
}

/** The source inspection view: what was actually put in the prompt, for a reviewer to read. */
export function toSourceInspection(row: AiSummaryDetailRow['sources'][number]) {
  return { ...toSourceRef(row), promptText: row.promptText };
}

function toVersionRef(row: AiSummaryDetailRow['versions'][number]): AiSummaryVersionRef {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    note: row.note,
    createdByName: row.createdBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toVersionDetail(
  row: AiSummaryDetailRow['versions'][number],
): AiSummaryVersionDetail {
  return {
    ...toVersionRef(row),
    internalContent: row.internalContent,
    clientContent: row.clientContent,
  };
}

function toRunSummary(row: AiSummaryDetailRow['runs'][number]): AiGenerationRunSummary {
  return {
    id: row.id,
    status: row.status,
    providerName: row.providerName,
    model: row.model,
    promptVersion: row.promptVersion,
    outputVersion: row.outputVersion,
    attempt: row.attempt,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    latencyMs: row.latencyMs,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}
