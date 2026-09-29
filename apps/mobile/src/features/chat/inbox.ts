import type { ConversationSummary, MessagingScopeContact } from '@ashniva/types';

import {
  CONVERSATION_FILTER,
  isInboxKind,
  matchesFilter,
  matchesSearch,
  type ConversationFilter,
  type ConversationListQuery,
} from './conversation-filters';

/**
 * The people inbox: existing threads first, then everybody else this person may reach.
 *
 * The same merge the web list makes. A person already shown as the other side of a visible thread
 * is not listed twice, and people never appear under Groups or Unread — a person with no thread
 * has nothing unread and is not a group.
 */
export type InboxEntry =
  { type: 'thread'; row: ConversationSummary } | { type: 'person'; contact: MessagingScopeContact };

export function mergeInbox(
  rows: readonly ConversationSummary[],
  directory: readonly MessagingScopeContact[],
  filter: ConversationFilter,
  needle: string,
  personalChat: boolean,
): InboxEntry[] {
  const threads = rows.filter(
    (row) => matchesFilter(row, filter, personalChat) && matchesSearch(row, needle),
  );
  const entries: InboxEntry[] = threads.map((row) => ({ type: 'thread', row }));
  if (
    !personalChat ||
    filter === CONVERSATION_FILTER.GROUPS ||
    filter === CONVERSATION_FILTER.UNREAD
  ) {
    return entries;
  }
  const named = new Set(threads.flatMap((row) => (row.counterpart ? [row.counterpart.id] : [])));
  for (const contact of directory) {
    if (!named.has(contact.id)) {
      entries.push({ type: 'person', contact });
    }
  }
  return entries;
}

/**
 * The figure on the Unread chip, or `null` when there is no honest one.
 *
 * Only while the request carries no `kind`: under Groups the window is groups only, and the same
 * sum would silently change meaning to "unread among groups".
 */
export function unreadChipCount(
  rows: readonly ConversationSummary[],
  serverQuery: ConversationListQuery,
  personalChat: boolean,
): number | null {
  if (serverQuery.kind !== undefined) {
    return null;
  }
  return rows
    .filter((row) => isInboxKind(row.kind, personalChat))
    .reduce((total, row) => total + row.unreadCount, 0);
}

export function inboxEntryKey(entry: InboxEntry): string {
  return entry.type === 'thread' ? `thread:${entry.row.id}` : `person:${entry.contact.id}`;
}
