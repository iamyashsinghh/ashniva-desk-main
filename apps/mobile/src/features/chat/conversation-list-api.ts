import {
  NOTIFICATION_TYPE,
  type ConversationSummary,
  type NotificationListResponse,
} from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';
import {
  matchesFilter,
  matchesSearch,
  serverQueryFor,
  type ConversationFilter,
  type ConversationListQuery,
} from './conversation-filters';

/**
 * How many conversations the list asks for, and how much further each "end reached" reaches.
 *
 * **`GET /conversations` has no cursor.** It takes a `limit` and answers with that many rows in
 * recency order — there is no `nextCursor` on the response and no `cursor` parameter on the DTO,
 * so there is no page two to ask for. Reaching further back therefore means asking for a bigger
 * window, which is what `loadMore` does, and it stops at the endpoint's own ceiling because a
 * larger `limit` is a 400. This is written down rather than dressed up as paging: a screen that
 * pretended to page would silently show the same first rows forever.
 */
export const CONVERSATION_PAGE_SIZE = 25;
export const MAX_CONVERSATION_WINDOW = 100;

/**
 * The list's cache key: what is actually *asked for*, not the chip.
 *
 * Two chips that send the same request share one entry — switching between All and Direct is a
 * filter over rows already on the device rather than a second identical round trip — and the tab
 * badge, which asks for the widest window with no filter, shares the entry the list reaches once
 * it has been widened that far.
 */
export function conversationListKey(query: ConversationListQuery, limit: number) {
  return ['conversations', 'list', query, limit] as const;
}

export function fetchConversationList(query: ConversationListQuery, limit: number) {
  return apiRequest<ConversationSummary[]>('/conversations', { query: { ...query, limit } });
}

export interface ConversationList {
  items: ConversationSummary[];
  /** Every row in the window, before the chip and the search — for the Unread chip's figure. */
  window: readonly ConversationSummary[];
  /** Conversation ids with an unread mention waiting, for the badge on a row. */
  mentioned: ReadonlySet<string>;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: unknown;
  /** True while the window can still be widened. False once the endpoint's ceiling is reached. */
  hasMore: boolean;
  /** Resolves when the refetch settles, so a pull-to-refresh spinner knows when to stop. */
  refresh: () => Promise<unknown>;
  loadMore: () => void;
}

/**
 * The conversation list, filtered and searched.
 *
 * One request per window, never one per row: every field a row draws — the counterpart, the
 * preview, the unread count — is on the summary the list endpoint returns, and asking about each
 * conversation in turn is the N+1 the backend spent work removing.
 */
export function useConversationList(
  filter: ConversationFilter,
  search: string,
  personalChat = true,
): ConversationList {
  const [limit, setLimit] = useState(CONVERSATION_PAGE_SIZE);
  const [widenedFor, setWidenedFor] = useState(filter);
  const serverQuery = serverQueryFor(filter);

  // Back to the first window whenever the chip changes: a widened window is a widened window for
  // the filter it was widened under, and carrying it across reads as the list having jumped.
  // Adjusted during render rather than in an effect — the React documentation's own pattern for
  // state that resets on a prop — so the wider window is never requested for the new chip first.
  if (widenedFor !== filter) {
    setWidenedFor(filter);
    setLimit(CONVERSATION_PAGE_SIZE);
  }

  const query = useQuery<ConversationSummary[]>({
    queryKey: conversationListKey(serverQuery, limit),
    queryFn: () => fetchConversationList(serverQuery, limit),
    retry: shouldRetry,
    // The previous window stays on screen while a wider one loads, so widening does not blank the
    // list and bounce the scroll position back to the top.
    placeholderData: (previous) => previous,
  });

  const mentioned = useUnreadMentions();
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const needle = search.trim().toLowerCase();
  const items = useMemo(
    () =>
      rows.filter((row) => matchesFilter(row, filter, personalChat) && matchesSearch(row, needle)),
    [rows, filter, needle, personalChat],
  );

  // Stable, because the screen refetches on focus with this as the effect's dependency: a new
  // function each render re-ran that effect on every state change the refetch itself caused, and
  // each run cancelled the previous refetch and started another — for as long as the tab was open.
  const { refetch } = query;
  const refresh = useCallback(() => refetch(), [refetch]);
  return {
    items,
    window: rows,
    mentioned,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching && !query.isPlaceholderData,
    isLoadingMore: query.isPlaceholderData,
    // What is already on screen survives a failed refresh: losing the list because one poll failed
    // on a train is worse than showing the list and a message.
    error: rows.length > 0 ? null : query.error,
    hasMore: rows.length >= limit && limit < MAX_CONVERSATION_WINDOW,
    refresh,
    loadMore: () => {
      if (rows.length >= limit && limit < MAX_CONVERSATION_WINDOW) {
        setLimit(Math.min(MAX_CONVERSATION_WINDOW, limit + CONVERSATION_PAGE_SIZE));
      }
    },
  };
}

/**
 * The conversations with an unread mention in them.
 *
 * Derived from the notification inbox rather than from the conversation list, because the list
 * carries no mention count: `ConversationSummary` has an unread total and a preview whose
 * mentions are masked to `@someone`, and nothing else. The inbox does carry it — the API writes
 * `entityType: 'conversation'` and the conversation's id onto every `CONVERSATION_MENTION` — so
 * one request for the unread notifications answers the question for the whole list at once,
 * which is the property that matters: a badge that cost a request per row would not be worth it.
 */
export function useUnreadMentions(): ReadonlySet<string> {
  const query = useQuery<NotificationListResponse>({
    queryKey: ['notifications', 'unread', 'mentions'],
    queryFn: () =>
      apiRequest<NotificationListResponse>('/notifications', {
        query: { unread: true, limit: 50 },
      }),
    retry: shouldRetry,
  });

  return useMemo(() => {
    const ids = new Set<string>();
    for (const item of query.data?.items ?? []) {
      if (item.type === NOTIFICATION_TYPE.CONVERSATION_MENTION && item.entityId) {
        ids.add(item.entityId);
      }
    }
    return ids;
  }, [query.data]);
}
