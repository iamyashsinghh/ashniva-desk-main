import { CONVERSATION_KIND, DERIVED_MEMBERSHIP_KINDS, PERMISSIONS, canUsePersonalChat, type ConversationKind, type ConversationSummary, type SessionUser } from '@ashniva/types';

/**
 * The filters above the conversation list.
 *
 * Chats is a people inbox: direct messages and groups. Project, task and ticket channels still
 * exist on those pages, and they are not listed here.
 *
 * **Two of them are the server's filter and two are not.** `GET /conversations` takes one `kind`
 * and an `unreadOnly` flag, so Unread and Groups can be asked for. "Direct" is two kinds (`DIRECT`
 * on a project and `SCOPE_DIRECT` outside one) and the parameter takes one, so that chip narrows
 * the window in the browser. The same predicate runs over every filter afterwards regardless,
 * because the previous chip's page stays on screen while the new one loads and must not leak rows
 * into it.
 */
export const CONVERSATION_FILTERS = [
  'all',
  'unread',
  'direct',
  'groups',
] as const;

export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const CONVERSATION_FILTER_LABELS: Record<ConversationFilter, string> = {
  all: 'All',
  unread: 'Unread',
  direct: 'Direct',
  groups: 'Groups',
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

/** Direct messages and groups — not project, task or ticket channels. */
export function isPeopleInboxKind(kind: ConversationKind): boolean {
  return !DERIVED_MEMBERSHIP_KINDS.includes(kind);
}

/** Roles that cannot private-chat only see the team group in Chats. */
export function isGroupOnlyInboxKind(kind: ConversationKind): boolean {
  return kind === CONVERSATION_KIND.GROUP;
}

export function inboxFiltersFor(personalChat: boolean): readonly ConversationFilter[] {
  return personalChat ? CONVERSATION_FILTERS : (['all', 'unread', 'groups'] as const);
}

/** Managers, leads, and anyone holding org-wide reach. Everyone else is group-only. */
export function inboxAllowsPersonalChat(user: Pick<SessionUser, 'roleKey' | 'permissions'>): boolean {
  return (
    canUsePersonalChat(user.roleKey) ||
    user.permissions.includes(PERMISSIONS.CONVERSATION_REACH_ORGANIZATION)
  );
}

/** Whether a row belongs under this chip. Applied to every row, server-narrowed or not. */
export function matchesFilter(
  row: ConversationSummary,
  filter: ConversationFilter,
  personalChat = true,
): boolean {
  if (!isPeopleInboxKind(row.kind)) {
    return false;
  }
  if (!personalChat && !isGroupOnlyInboxKind(row.kind)) {
    return false;
  }
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
