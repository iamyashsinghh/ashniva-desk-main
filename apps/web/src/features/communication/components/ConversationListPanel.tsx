import { type ConversationSummary, type MessagingScopeContact } from '@ashniva/types';
import { Button, EmptyState, Input, SegmentedControl, Spinner } from '@ashniva/ui';
import { useMemo, useState, type ReactNode } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { errorMessage } from '../../../shared/lib/api-client';
import { useCurrentUser } from '../../auth/session-context';
import { useConversationsQuery } from '../api';
import {
  CONVERSATION_FILTER_LABELS,
  inboxFiltersFor,
  inboxAllowsPersonalChat,
  isGroupOnlyInboxKind,
  isPeopleInboxKind,
  matchesFilter,
  matchesSearch,
  serverQueryFor,
  type ConversationFilter,
} from '../conversation-filters';
import { useMessagingDirectoryQuery, useScopeConversationMutations } from '../scope-api';
import { ConversationRow, PersonRow } from './ConversationRow';

/** How many conversations a page holds, and how much further "show more" reaches. */
const PAGE_SIZE = 25;
/** The endpoint's own ceiling. Asking for more is a 400, so the button stops here. */
const MAX_PAGE = 100;

export interface ConversationListPanelProps {
  projectId?: string;
  selectedId?: string;
  /** Conversations with an unread mention, from the viewer's own notifications. */
  mentioned?: ReadonlySet<string>;
  /** The project picker, when the screen has one to offer. */
  header?: ReactNode;
  /** Corner inbox: name search only — the chip bar does not fit a 22rem popover. */
  compact?: boolean;
  onSelect: (conversation: ConversationSummary) => void;
}

type InboxEntry =
  | { type: 'thread'; row: ConversationSummary }
  | { type: 'person'; contact: MessagingScopeContact };

/**
 * People this person can message: existing threads, then everybody else they may reach.
 *
 * Project, task and ticket channels are not listed here — they live on those pages. Developers
 * and other non-management staff only see the project team group; managers and leads also see
 * the people on their teams so they can open a private thread.
 */
export function ConversationListPanel({
  projectId,
  selectedId,
  mentioned,
  header,
  compact = false,
  onSelect,
}: ConversationListPanelProps) {
  const personalChat = inboxAllowsPersonalChat(useCurrentUser());
  const filters = inboxFiltersFor(personalChat);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [limit, setLimit] = useState(compact ? MAX_PAGE : PAGE_SIZE);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | undefined>();

  const serverQuery = serverQueryFor(filter);
  const list = useConversationsQuery({
    ...(projectId ? { projectId } : {}),
    limit,
    ...serverQuery,
  });
  const directory = useMessagingDirectoryQuery(search, personalChat);
  const { openDirect } = useScopeConversationMutations();
  const rows = useMemo(() => list.data ?? [], [list.data]);

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () => mergeInbox(rows, personalChat ? (directory.data ?? []) : [], filter, needle, personalChat),
    [rows, directory.data, filter, needle, personalChat],
  );
  /**
   * The figure on the Unread chip, or `null` when there is no honest one to show.
   *
   * Counted over people threads in the window in hand. Under Groups the request carries
   * `?kind=GROUP`, so the same sum would silently become "unread among groups" — a number that
   * changed meaning rather than value. Shown only while the request carries no `kind`.
   */
  const unread =
    serverQuery.kind === undefined
      ? rows
          .filter((row) => (personalChat ? isPeopleInboxKind(row.kind) : isGroupOnlyInboxKind(row.kind)))
          .reduce((total, row) => total + row.unreadCount, 0)
      : null;
  const canLoadMore = rows.length >= limit && limit < MAX_PAGE;
  const isNarrowed = needle.length > 0 || filter !== 'all';
  const isLoading = list.isLoading || (directory.isLoading && directory.data === undefined);

  async function openPerson(contact: MessagingScopeContact) {
    if (openingId) {
      return;
    }
    if (contact.conversationId) {
      const existing = rows.find((row) => row.id === contact.conversationId);
      if (existing) {
        onSelect(existing);
        return;
      }
    }
    setOpenError(undefined);
    setOpeningId(contact.id);
    try {
      const conversation = await openDirect.mutateAsync(contact.id);
      onSelect(conversation);
    } catch (cause) {
      setOpenError(errorMessage(cause));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel__search">
        <Input
          type="search"
          value={search}
          aria-label="Search your conversations"
          placeholder={compact ? 'Search chats' : 'Search people'}
          onChange={(event) => setSearch(event.target.value)}
        />
        {list.isFetching || directory.isFetching ? <Spinner size="sm" /> : null}
      </div>

      {header ? <div className="chat-panel__header">{header}</div> : null}

      {compact ? null : (
        <div className="chat-panel__filters">
          <SegmentedControl
            aria-label="Filter conversations"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={filters.map((key) => ({
              key,
              label: CONVERSATION_FILTER_LABELS[key],
              ...(key === 'unread' && unread !== null && unread > 0 ? { count: unread } : {}),
            }))}
          />
        </div>
      )}

      {openError ? (
        <p className="form-error" role="alert">
          {openError}
        </p>
      ) : null}

      <QueryState
        isLoading={isLoading}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
      >
        {visible.length === 0 ? (
          <EmptyState
            size="sm"
            title={isNarrowed ? 'Nothing matches' : personalChat ? 'No one to message yet' : 'No team group yet'}
            description={
              isNarrowed
                ? 'Try a different search, or choose “All”.'
                : personalChat
                  ? 'People you can message will show up here once there is someone on your projects or teams.'
                  : 'The group for your project team will show up here. You can write there, not in a private chat.'
            }
          />
        ) : (
          <ul className="chat-list chat-list--conversations">
            {visible.map((entry) =>
              entry.type === 'thread' ? (
                <ConversationRow
                  key={entry.row.id}
                  row={entry.row}
                  isSelected={entry.row.id === selectedId}
                  isMentioned={mentioned?.has(entry.row.id) ?? false}
                  compact={compact}
                  onSelect={() => onSelect(entry.row)}
                />
              ) : (
                <PersonRow
                  key={entry.contact.id}
                  contact={entry.contact}
                  opening={openingId === entry.contact.id}
                  onSelect={() => void openPerson(entry.contact)}
                />
              ),
            )}
          </ul>
        )}
      </QueryState>

      {canLoadMore ? (
        <Button
          variant="ghost"
          size="sm"
          loading={list.isFetching}
          onClick={() => setLimit(Math.min(MAX_PAGE, limit + PAGE_SIZE))}
        >
          Show more conversations
        </Button>
      ) : null}
    </div>
  );
}

function mergeInbox(
  rows: readonly ConversationSummary[],
  directory: readonly MessagingScopeContact[],
  filter: ConversationFilter,
  needle: string,
  personalChat: boolean,
): InboxEntry[] {
  const threads = rows.filter(
    (row) => matchesFilter(row, filter, personalChat) && matchesSearch(row, needle),
  );
  const named = new Set(
    threads.flatMap((row) => (row.counterpart?.id ? [row.counterpart.id] : [])),
  );
  const entries: InboxEntry[] = threads.map((row) => ({ type: 'thread', row }));
  if (filter === 'groups' || filter === 'unread') {
    return entries;
  }
  for (const contact of directory) {
    if (named.has(contact.id)) {
      continue;
    }
    entries.push({ type: 'person', contact });
  }
  return entries;
}
