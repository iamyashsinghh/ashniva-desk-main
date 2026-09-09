import { CONVERSATION_KIND, type ConversationKind, type ConversationSummary } from '@ashniva/types';

/**
 * The filters above the conversation list.
 *
 * Seven chips rather than the two switches the list used to carry, because "which of my threads is
 * this" is the question somebody actually arrives with, and a search box only answers it once they
 * already know the name.
 *
 * **Five of them are the server's filter and two are not, and that is the split that matters.**
 * `GET /conversations` takes one `kind` and an `unreadOnly` flag, so Unread, Groups, Project, Task
 * and Ticket can be asked for — and must be, because the endpoint answers with the most recent
 * `limit` rows and an unfiltered window would spend those rows on conversations the chip is about
 * to hide, leaving somebody busy with fewer task threads on screen than they actually have.
 * "Direct" is two kinds (`DIRECT` on a project and `SCOPE_DIRECT` outside one) and the parameter
 * takes one, so that chip narrows the window in the browser. The same predicate runs over every
 * filter afterwards regardless, because the previous chip's page stays on screen while the new
 * one loads and must not leak rows into it.
 */
export const CONVERSATION_FILTERS = [
  'all',
  'unread',
  'direct',
  'groups',
  'project',
  'task',
  'ticket',
] as const;

export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const CONVERSATION_FILTER_LABELS: Record<ConversationFilter, string> = {
  all: 'All',
  unread: 'Unread',
  direct: 'Direct',
  groups: 'Groups',
  project: 'Project',
  task: 'Task',
  ticket: 'Ticket',
};

/**
 * Which kinds a chip admits.
 *
 * `direct` covers both direct kinds: whether the relationship behind a one-to-one thread is a
 * shared project or a management scope is a permission question, and somebody looking for the
 * conversation they had with Priya does not hold that distinction in their head.
 */
const KINDS_BY_FILTER: Partial<Record<ConversationFilter, readonly ConversationKind[]>> = {
  direct: [CONVERSATION_KIND.DIRECT, CONVERSATION_KIND.SCOPE_DIRECT],
  groups: [CONVERSATION_KIND.GROUP],
  project: [CONVERSATION_KIND.PROJECT],
  task: [CONVERSATION_KIND.TASK],
  ticket: [CONVERSATION_KIND.TICKET],
};

/** What the request carries for this chip. Absent fields are simply not sent. */
export interface ConversationListQuery {
  kind?: ConversationKind;
  unreadOnly?: boolean;
}

/**
 * The parameters that narrow the window on the server, for the chips the endpoint can express.
 *
 * Nothing for `all`, and nothing for `direct`: `kind` takes one value, so asking for
 * `kind=DIRECT` would quietly drop every `SCOPE_DIRECT` row — a wrong answer rather than a slow
 * one. Those two chips are narrowed in the browser instead.
 */
export function serverQueryFor(filter: ConversationFilter): ConversationListQuery {
  if (filter === 'unread') {
    return { unreadOnly: true };
  }
  const kinds = KINDS_BY_FILTER[filter];
  return kinds?.length === 1 ? { kind: kinds[0] as ConversationKind } : {};
}

/** Whether a row belongs under this chip. Applied to every row, server-narrowed or not. */
export function matchesFilter(row: ConversationSummary, filter: ConversationFilter): boolean {
  if (filter === 'unread') {
    return row.unreadCount > 0;
  }
  const kinds = KINDS_BY_FILTER[filter];
  return kinds ? kinds.includes(row.kind) : true;
}

/** Whether a row answers what somebody typed. Everything the row itself shows is searchable. */
export function matchesSearch(row: ConversationSummary, needle: string): boolean {
  if (needle.length === 0) {
    return true;
  }
  const haystack = [
    row.title,
    row.counterpart?.name,
    row.project?.code,
    row.project?.name,
    row.task?.key,
    row.ticket?.key,
    row.lastMessagePreview,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/** What a row is attached to, as the short line under the name. */
export function contextLabelOf(row: ConversationSummary): string | null {
  if (row.task) {
    return row.task.key;
  }
  if (row.ticket) {
    return row.ticket.key;
  }
  return row.project?.code ?? null;
}
