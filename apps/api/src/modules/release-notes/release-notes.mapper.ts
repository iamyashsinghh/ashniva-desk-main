import type {
  PortalReleaseNote,
  PortalReleaseNoteSummary,
  ReleaseNoteDetail,
  ReleaseNoteHistoryEntry,
  ReleaseNoteItemKind,
  ReleaseNoteItemSummary,
  ReleaseNoteStatus,
  ReleaseNoteSummary,
} from '@ashniva/types';

import type { ReleaseNoteDetailRow, ReleaseNoteSummaryRow } from './release-notes.repository';

/**
 * Allow-list mappers. The internal shapes carry an approval trail and internal notes, so every
 * function here names the fields it exposes rather than spreading a row.
 */

const day = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;

export function toReleaseNoteSummary(row: ReleaseNoteSummaryRow): ReleaseNoteSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    projectCode: row.project.code,
    clientOrganizationId: row.clientOrganizationId,
    version: row.version,
    releaseDate: day(row.releaseDate) ?? '',
    status: row.status as ReleaseNoteStatus,
    itemCount: row._count.items,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPortalReleaseNoteSummary(row: ReleaseNoteSummaryRow): PortalReleaseNoteSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    releaseDate: day(row.releaseDate) ?? '',
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toItem(row: ReleaseNoteDetailRow['items'][number]): ReleaseNoteItemSummary {
  return {
    id: row.id,
    kind: row.kind as ReleaseNoteItemKind,
    source: row.source as 'GENERATED' | 'MANUAL',
    refId: row.refId,
    externalRef: row.externalRef,
    label: row.label,
    clientLabel: row.clientLabel,
    clientVisible: row.clientVisible,
    sortOrder: row.sortOrder,
  };
}

function toHistory(row: ReleaseNoteDetailRow['history'][number]): ReleaseNoteHistoryEntry {
  return {
    id: row.id,
    fromStatus: (row.fromStatus as ReleaseNoteStatus | null) ?? null,
    toStatus: row.toStatus as ReleaseNoteStatus,
    note: row.note,
    changedByName: row.changedBy.name,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toReleaseNoteDetail(row: ReleaseNoteDetailRow): ReleaseNoteDetail {
  return {
    id: row.id,
    projectId: row.projectId,
    projectCode: row.project.code,
    clientOrganizationId: row.clientOrganizationId,
    version: row.version,
    releaseDate: day(row.releaseDate) ?? '',
    status: row.status as ReleaseNoteStatus,
    itemCount: row.items.length,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    periodStart: day(row.periodStart),
    periodEnd: day(row.periodEnd),
    internalNotes: row.internalNotes,
    clientSummary: row.clientSummary,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    items: row.items.map(toItem),
    history: row.history.map(toHistory),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The portal view.
 *
 * Two things are dropped here that the internal view carries, and both matter: items flagged
 * not client-visible, and every field of the approval trail. `clientLabel` wins over `label`
 * where an editor rewrote wording that was too internal.
 */
export function toPortalReleaseNote(row: ReleaseNoteDetailRow): PortalReleaseNote {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    releaseDate: day(row.releaseDate) ?? '',
    summary: row.clientSummary,
    // A published note always has this set; the fallback keeps the type honest rather than
    // asserting non-null.
    publishedAt: row.publishedAt?.toISOString() ?? row.updatedAt.toISOString(),
    items: row.items
      .filter((item) => item.clientVisible)
      .map((item) => ({
        label: item.clientLabel ?? item.label,
        kind: item.kind as ReleaseNoteItemKind,
      })),
  };
}
