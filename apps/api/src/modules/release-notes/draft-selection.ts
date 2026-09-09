import type { ReleaseNoteItemKind } from '@ashniva/types';

/**
 * Chooses what goes into a generated release-note draft, and in what order.
 *
 * Pure on purpose. Deciding what a client is allowed to read is the part of this feature most
 * worth testing exhaustively, and it is much easier to be sure of when it does not need a
 * database. The service fetches candidates and hands them here; this function never reads a row
 * itself and never sees an internal comment, an estimate or a cost, because those are not on the
 * candidate shape at all.
 */

export interface SourceCandidate {
  kind: ReleaseNoteItemKind;
  /** Row id for a task/ticket/update; null for a code activity, which uses externalRef. */
  refId: string | null;
  /** Provider id for a code activity (commit sha, PR number). */
  externalRef: string | null;
  label: string;
  /** Only client-visible work reaches a client-facing document. */
  clientVisible: boolean;
  occurredAt: Date;
}

export interface SelectedItem {
  kind: ReleaseNoteItemKind;
  refId: string | null;
  externalRef: string | null;
  label: string;
  clientVisible: boolean;
  sortOrder: number;
}

/**
 * Kinds are grouped in the order a reader expects: what changed for them first, then support
 * outcomes, then narrative updates, then the development detail.
 */
const KIND_ORDER: Record<ReleaseNoteItemKind, number> = {
  TASK: 0,
  TICKET: 1,
  CLIENT_UPDATE: 2,
  CODE_ACTIVITY: 3,
  MANUAL: 4,
};

/** Identity of a candidate, for de-duplication. Two rows with the same identity are one item. */
function identityOf(candidate: Pick<SourceCandidate, 'kind' | 'refId' | 'externalRef'>): string {
  return `${candidate.kind}:${candidate.refId ?? ''}:${candidate.externalRef ?? ''}`;
}

export function itemIdentity(item: {
  kind: ReleaseNoteItemKind;
  refId: string | null;
  externalRef: string | null;
}): string {
  return identityOf(item);
}

/**
 * Turns candidates into the draft's items.
 *
 * - Work that is not client-visible is dropped outright. That is the single rule keeping internal
 *   tasks and internal-only tickets out of a document a client will read.
 * - Duplicates collapse by identity, so a task that also appears via a merged pull request, or a
 *   second generation over an overlapping period, does not produce two lines.
 * - `existing` carries the items already on the note. Anything already there is left alone, which
 *   is what makes regeneration additive rather than destructive: a manually added or hand-edited
 *   line survives a regenerate.
 * - Ordering is fully determined by (kind, occurredAt, identity), never by the order rows came
 *   back from the database, so regenerating the same period twice produces the same document.
 */
export function selectDraftItems(
  candidates: SourceCandidate[],
  existing: { kind: ReleaseNoteItemKind; refId: string | null; externalRef: string | null }[] = [],
): SelectedItem[] {
  const alreadyPresent = new Set(existing.map(identityOf));
  const chosen = new Map<string, SourceCandidate>();

  for (const candidate of candidates) {
    if (!candidate.clientVisible) {
      continue;
    }
    if (!candidate.label.trim()) {
      continue;
    }
    const identity = identityOf(candidate);
    if (alreadyPresent.has(identity) || chosen.has(identity)) {
      continue;
    }
    chosen.set(identity, candidate);
  }

  return [...chosen.values()]
    .sort((left, right) => {
      const byKind = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
      if (byKind !== 0) {
        return byKind;
      }
      const byTime = left.occurredAt.getTime() - right.occurredAt.getTime();
      if (byTime !== 0) {
        return byTime;
      }
      // Last resort so two items at the same instant still order the same way every run.
      return identityOf(left).localeCompare(identityOf(right));
    })
    .map((candidate, index) => ({
      kind: candidate.kind,
      refId: candidate.refId,
      externalRef: candidate.externalRef,
      label: candidate.label.trim(),
      clientVisible: true,
      sortOrder: (existing.length + index) * 10,
    }));
}

/** Inclusive start, exclusive end. A null period means "everything up to now". */
export interface ReportingPeriod {
  start: Date | null;
  end: Date;
}

/**
 * The reporting period for a generation run.
 *
 * Defaults to the day after the previous published note for this project, so consecutive releases
 * tile without gaps or overlap. With no previous note it falls back to `defaultDays` before the
 * release date rather than the whole history of the project.
 */
export function reportingPeriod(
  releaseDate: Date,
  previousPublishedAt: Date | null,
  defaultDays = 30,
): ReportingPeriod {
  const end = new Date(releaseDate);
  end.setUTCDate(end.getUTCDate() + 1);

  if (previousPublishedAt) {
    return { start: new Date(previousPublishedAt), end };
  }
  const start = new Date(releaseDate);
  start.setUTCDate(start.getUTCDate() - defaultDays);
  return { start, end };
}
