import type { ConversationSummary } from '@ashniva/types';
import { Button, EmptyState, Input, SegmentedControl, Spinner } from '@ashniva/ui';
import { useMemo, useState, type ReactNode } from 'react';

import { QueryState } from '../../../shared/components/QueryState';
import { useConversationsQuery } from '../api';
import {
  CONVERSATION_FILTERS,
  CONVERSATION_FILTER_LABELS,
  matchesFilter,
  matchesSearch,
  serverQueryFor,
  type ConversationFilter,
} from '../conversation-filters';
import { ConversationRow } from './ConversationRow';

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
  onSelect: (conversation: ConversationSummary) => void;
}

/**
 * Every conversation this person has: searchable, filtered by what it is attached to, and with the
 * unread ones findable.
 *
 * **The list is the server's answer**, re-checked against the live relationship on every request:
 * a project somebody has left simply stops appearing, and a group they were removed from goes with
 * it, without anything being deleted.
 *
 * **It pages, and it does not fan out.** `GET /conversations` takes a limit and returns everything
 * a row needs, so drawing this list is one request however long it is. The detail request happens
 * once, for the thread that is open.
 *
 * **The chips travel with the request; the search box does not.** The endpoint answers with the
 * most recent `limit` conversations, so a chip applied only to that answer shows somebody busy
 * fewer task threads than they have — the window would already have been spent on the kinds the
 * chip is about to hide. `unreadOnly` and `kind` therefore go to the server; "Direct" is two kinds
 * and the parameter takes one, so that chip alone narrows here. Search stays local because it is
 * per keystroke and the endpoint has no term to take.
 *
 * **The Unread chip's figure is counted over that window, so it is shown only while the window
 * still holds every kind.** See `unread` below.
 */
export function ConversationListPanel({
  projectId,
  selectedId,
  mentioned,
  header,
  onSelect,
}: ConversationListPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const serverQuery = serverQueryFor(filter);
  const list = useConversationsQuery({
    ...(projectId ? { projectId } : {}),
    limit,
    ...serverQuery,
  });
  const rows = useMemo(() => list.data ?? [], [list.data]);

  const needle = search.trim().toLowerCase();
  // Re-checked in the browser even for the chips the server narrowed: the previous chip's page
  // stays on screen while the new one is fetched, and it must not be read as this chip's answer.
  const visible = useMemo(
    () => rows.filter((row) => matchesFilter(row, filter) && matchesSearch(row, needle)),
    [rows, filter, needle],
  );
  /**
   * The figure on the Unread chip, or `null` when there is no honest one to show.
   *
   * It is counted over the window in hand, and since the chips began narrowing that window on the
   * server that window is no longer always every kind. Under Project, Task, Ticket or Groups the
   * request carries `?kind=…`, so the same sum silently becomes "unread among the threads of the
   * kind you are looking at" — a number that changed meaning rather than value, on the one chip
   * whose whole job is to say how much is waiting everywhere. So it is shown only while the
   * request carries no `kind`, which is All, Direct and Unread itself.
   *
   * Dropping it under a kind chip rather than fetching an unfiltered page for it: a second query
   * would be a second request in exactly the four cases that need it — the unfiltered key only
   * dedupes with this one when this one is already unfiltered — and a count nobody asked for is
   * not worth a request. Nothing is hidden by hiding it; the Unread chip is one click away and
   * brings the whole figure back with it.
   */
  const unread =
    serverQuery.kind === undefined ? rows.reduce((total, row) => total + row.unreadCount, 0) : null;
  const canLoadMore = rows.length >= limit && limit < MAX_PAGE;
  const isNarrowed = needle.length > 0 || filter !== 'all';

  return (
    <div className="chat-panel">
      <div className="chat-panel__search">
        <Input
          type="search"
          value={search}
          aria-label="Search your conversations"
          placeholder="Search conversations"
          onChange={(event) => setSearch(event.target.value)}
        />
        {list.isFetching ? <Spinner size="sm" /> : null}
      </div>

      {header ? <div className="chat-panel__header">{header}</div> : null}

      <div className="chat-panel__filters">
        <SegmentedControl
          aria-label="Filter conversations"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={CONVERSATION_FILTERS.map((key) => ({
            key,
            label: CONVERSATION_FILTER_LABELS[key],
            ...(key === 'unread' && unread !== null && unread > 0 ? { count: unread } : {}),
          }))}
        />
      </div>

      <QueryState
        isLoading={list.isLoading}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
      >
        {visible.length === 0 ? (
          <EmptyState
            size="sm"
            title={isNarrowed ? 'Nothing matches' : 'No conversations yet'}
            description={
              isNarrowed
                ? 'Try a different search, or choose “All”.'
                : 'Start a direct message or a group, or open one from a project, task or ticket.'
            }
          />
        ) : (
          <ul className="chat-list chat-list--conversations">
            {visible.map((row) => (
              <ConversationRow
                key={row.id}
                row={row}
                isSelected={row.id === selectedId}
                isMentioned={mentioned?.has(row.id) ?? false}
                onSelect={() => onSelect(row)}
              />
            ))}
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
