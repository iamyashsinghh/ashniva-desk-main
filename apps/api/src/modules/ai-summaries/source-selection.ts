import {
  AI_SOURCE_KIND,
  isClientFacingSummary,
  type AiSourceKind,
  type AiSummaryType,
} from '@ashniva/types';

import { sanitiseSourceText, type SanitisedText } from './injection-guard';

/**
 * Which records a summary may be built from, and which of them may inform client-visible text.
 *
 * Two separate questions, deliberately kept apart:
 *
 * - **Authorised** — may this kind of record be read at all for this kind of summary? A ticket
 *   resolution summary has no business reading milestones; a client weekly has no business
 *   reading work logs. Answering this here rather than in the collector means the allow-list is
 *   one table that can be read in ten seconds, rather than a set of query conditions.
 * - **Client-visible** — may this particular record's text end up in something a client reads?
 *   That depends on the record, not the summary: an internal comment is internal whichever
 *   document quotes it.
 *
 * Nothing outside these lists is ever collected. There is no "everything else" branch.
 */

/** The record kinds each summary type is allowed to read. */
export const AUTHORISED_SOURCES: Record<AiSummaryType, readonly AiSourceKind[]> = {
  DEVELOPER_DAILY: [
    AI_SOURCE_KIND.TASK,
    AI_SOURCE_KIND.TASK_STATUS_CHANGE,
    AI_SOURCE_KIND.WORK_LOG,
    AI_SOURCE_KIND.TICKET,
    AI_SOURCE_KIND.CODE_ACTIVITY,
  ],
  LEAD_DAILY: [
    AI_SOURCE_KIND.TASK,
    AI_SOURCE_KIND.TASK_STATUS_CHANGE,
    AI_SOURCE_KIND.WORK_LOG,
    AI_SOURCE_KIND.TICKET,
    AI_SOURCE_KIND.MILESTONE,
    AI_SOURCE_KIND.CODE_ACTIVITY,
  ],
  PROJECT_PROGRESS: [
    AI_SOURCE_KIND.TASK,
    AI_SOURCE_KIND.TASK_STATUS_CHANGE,
    AI_SOURCE_KIND.MILESTONE,
    AI_SOURCE_KIND.CLIENT_UPDATE,
    AI_SOURCE_KIND.RELEASE_NOTE,
  ],
  // Deliberately no work logs and no tickets' internal fields: a client weekly is built from
  // what has already been made client-visible, plus the shape of the work.
  CLIENT_WEEKLY: [
    AI_SOURCE_KIND.TASK,
    AI_SOURCE_KIND.MILESTONE,
    AI_SOURCE_KIND.CLIENT_UPDATE,
    AI_SOURCE_KIND.RELEASE_NOTE,
  ],
  RELEASE_NOTE_DRAFT: [
    AI_SOURCE_KIND.TASK,
    AI_SOURCE_KIND.CLIENT_UPDATE,
    AI_SOURCE_KIND.CODE_ACTIVITY,
    AI_SOURCE_KIND.RELEASE_NOTE,
  ],
  TICKET_RESOLUTION: [AI_SOURCE_KIND.TICKET, AI_SOURCE_KIND.TASK, AI_SOURCE_KIND.WORK_LOG],
};

export function isAuthorisedSource(type: AiSummaryType, kind: AiSourceKind): boolean {
  return AUTHORISED_SOURCES[type].includes(kind);
}

/** A record as the collector found it, before sanitising. */
export interface RawSource {
  kind: AiSourceKind;
  refId: string | null;
  label: string;
  /** The record's own text. May be internal.  */
  text: string | null;
  occurredAt: Date | null;
  /** True only when the record itself is marked client-visible. Defaults to false. */
  clientVisible: boolean;
}

/** A record ready to go into a prompt. */
export interface PreparedSource {
  kind: AiSourceKind;
  refId: string | null;
  label: string;
  promptText: string;
  occurredAt: Date | null;
  clientVisible: boolean;
  flagged: boolean;
  sortOrder: number;
}

export interface PreparedSources {
  sources: PreparedSource[];
  /** Sources dropped because the summary type is not allowed to read that kind. */
  rejected: number;
  /** True when at least one source read like an attempt to instruct the model. */
  flagged: boolean;
  /** Set when there was too little to summarise honestly. */
  missingDataNote: string | null;
}

/** Below this, a summary would be padding rather than reporting. */
const THIN_THRESHOLD = 3;

/**
 * Filters, sanitises and orders the sources for one summary.
 *
 * For a client-facing summary type, records that are not themselves client-visible are dropped
 * entirely rather than passed in and relied upon not to be quoted. The model cannot leak what it
 * was never given.
 */
export function prepareSources(type: AiSummaryType, raw: readonly RawSource[]): PreparedSources {
  const clientFacing = isClientFacingSummary(type);
  let rejected = 0;
  const kept: PreparedSource[] = [];
  const cleaned: SanitisedText[] = [];

  for (const source of raw) {
    if (!isAuthorisedSource(type, source.kind)) {
      rejected += 1;
      continue;
    }
    if (clientFacing && !source.clientVisible) {
      rejected += 1;
      continue;
    }
    const label = sanitiseSourceText(source.label);
    const text = sanitiseSourceText(source.text);
    cleaned.push(label, text);
    kept.push({
      kind: source.kind,
      refId: source.refId,
      label: label.text || '(untitled)',
      promptText: text.text,
      occurredAt: source.occurredAt,
      clientVisible: source.clientVisible,
      flagged: label.flagged || text.flagged,
      sortOrder: 0,
    });
  }

  // Oldest first, so the summary reads in the order the work happened. Records with no timestamp
  // sort last rather than being dropped: a task with no status change is still a fact.
  kept.sort((a, b) => {
    if (a.occurredAt && b.occurredAt) return a.occurredAt.getTime() - b.occurredAt.getTime();
    if (a.occurredAt) return -1;
    if (b.occurredAt) return 1;
    return a.label.localeCompare(b.label);
  });
  kept.forEach((source, index) => {
    source.sortOrder = index;
  });

  return {
    sources: kept,
    rejected,
    flagged: cleaned.some((entry) => entry.flagged),
    missingDataNote: missingDataNoteFor(kept.length, rejected, clientFacing),
  };
}

/**
 * What to tell a reviewer about the sources.
 *
 * Saying "there was little to go on" is more useful than a confident paragraph built from two
 * records, and it is the reviewer, not the model, who should decide what to do about it.
 */
function missingDataNoteFor(kept: number, rejected: number, clientFacing: boolean): string | null {
  if (kept === 0) {
    return 'No authorised source records were found for this period, so there is nothing to summarise.';
  }

  // Both facts can hold at once — a thin period *because* internal records were withheld is the
  // most common case — so both are reported rather than one winning.
  const notes: string[] = [];
  if (kept < THIN_THRESHOLD) {
    notes.push(
      `Only ${kept} source record${kept === 1 ? '' : 's'} covered this period. Treat the summary as partial.`,
    );
  }
  if (clientFacing && rejected > 0) {
    notes.push(
      `${rejected} internal record${rejected === 1 ? ' was' : 's were'} excluded because this summary may be shown to a client.`,
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}
