import { CONVERSATION_KIND, DERIVED_MEMBERSHIP_KINDS, type ConversationKind, type ConversationSummary } from '@ashniva/types';

/**
 * The filters the conversation list offers, and where each one is applied.
 *
 * A phone gets a scrollable row of chips rather than the web app's sidebar: a sidebar costs a
 * column the screen does not have, and a chip row is reachable with the thumb that is already
 * holding the phone.
 *
 * Chats is a people inbox. Project, task and ticket channels still exist on those pages.
 *
 * **Two of them are the server's filter and the rest are not.** `GET /conversations` takes one
 * `kind` and an `unreadOnly` flag, so Groups and Unread can be asked for. "Direct" is two kinds
 * and the parameter takes one, so that chip filters the window already on the device.
 */

export const CONVERSATION_FILTER = {
  ALL: 'ALL',
  UNREAD: 'UNREAD',
  DIRECT: 'DIRECT',
  GROUPS: 'GROUPS',
} as const;

export type ConversationFilter = (typeof CONVERSATION_FILTER)[keyof typeof CONVERSATION_FILTER];

/** Chip order: the two that answer "what needs me" first, then the kinds. */
export const CONVERSATION_FILTERS: readonly ConversationFilter[] = [
  CONVERSATION_FILTER.ALL,
  CONVERSATION_FILTER.UNREAD,
  CONVERSATION_FILTER.DIRECT,
  CONVERSATION_FILTER.GROUPS,
];

export const CONVERSATION_FILTER_LABELS: Record<ConversationFilter, string> = {
  ALL: 'All',
  UNREAD: 'Unread',
  DIRECT: 'Direct',
  GROUPS: 'Groups',
};

/** The kinds each chip admits. Empty for the two that are not about a kind at all. */
const FILTER_KINDS: Record<ConversationFilter, readonly ConversationKind[]> = {
  ALL: [],
  UNREAD: [],
  DIRECT: [CONVERSATION_KIND.DIRECT, CONVERSATION_KIND.SCOPE_DIRECT],
  GROUPS: [CONVERSATION_KIND.GROUP],
};

/** What the request carries for this chip. Absent fields are simply not sent. */
export interface ConversationListQuery {
  kind?: ConversationKind;
  unreadOnly?: boolean;
}

/**
 * The query parameters that narrow the window on the server.
 *
 * Only where the endpoint can express the chip exactly. Sending `kind=DIRECT` for the Direct chip
 * would quietly drop every `SCOPE_DIRECT` row, which is a wrong answer rather than a slow one.
 */
export function serverQueryFor(filter: ConversationFilter): ConversationListQuery {
  if (filter === CONVERSATION_FILTER.UNREAD) {
    return { unreadOnly: true };
  }
  const kinds = FILTER_KINDS[filter];
  return kinds.length === 1 ? { kind: kinds[0] as ConversationKind } : {};
}

/** Roles that cannot private-chat only see the team group. Direct is not theirs. */
export function inboxFiltersFor(personalChat: boolean): readonly ConversationFilter[] {
  return personalChat
    ? CONVERSATION_FILTERS
    : ([
        CONVERSATION_FILTER.ALL,
        CONVERSATION_FILTER.UNREAD,
        CONVERSATION_FILTER.GROUPS,
      ] as const);
}

/** Whether a row belongs under this chip. Applied to every row, server-narrowed or not. */
export function matchesFilter(
  row: ConversationSummary,
  filter: ConversationFilter,
  personalChat = true,
): boolean {
  if (DERIVED_MEMBERSHIP_KINDS.includes(row.kind)) {
    return false;
  }
  if (!personalChat && row.kind !== CONVERSATION_KIND.GROUP) {
    return false;
  }
  if (filter === CONVERSATION_FILTER.ALL) {
    return true;
  }
  if (filter === CONVERSATION_FILTER.UNREAD) {
    return row.unreadCount > 0;
  }
  return FILTER_KINDS[filter].includes(row.kind);
}

/**
 * Whether a row answers what somebody typed.
 *
 * Over the page already on the device, so it costs no request and works with no signal. Every
 * field the row itself draws is searchable; nothing that is not shown is, because a match the
 * person cannot see reads as a bug.
 */
export function matchesSearch(row: ConversationSummary, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return [
    row.title,
    row.counterpart?.name,
    row.project?.code,
    row.task?.key,
    row.ticket?.key,
    row.lastMessagePreview,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/** The name a row shows: the other person for a pair, the conversation's own title otherwise. */
export function conversationLabel(row: ConversationSummary): string {
  return row.counterpart?.name ?? row.title;
}
