import {
  DEFAULT_MENTIONABLE_LIMIT,
  NOTIFICATION_TYPE,
  type ConversationSummary,
  type MentionablePage,
  type MentionableUser,
  type MessagePage,
  type MessageSummary,
  type NotificationListResponse,
} from '@ashniva/types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';
import {
  matchesFilter,
  matchesSearch,
  serverQueryFor,
  type ConversationFilter,
} from './conversation-filters';

/**
 * Reading conversations and threads.
 *
 * **Why this polls rather than holding a socket.** The API has a Socket.IO gateway and the web app
 * uses it, and the phone deliberately does not — for the first release. A socket on a phone is not
 * the same object it is in a browser tab: it has to be torn down when the app backgrounds and
 * rebuilt when it returns, reauthenticated against a token that rotates every fifteen minutes,
 * backed off when the radio comes and goes, and reconciled with whatever was missed while it was
 * down. That is a real piece of work, and every part of it that is wrong shows up as a
 * conversation that has silently stopped updating — which is worse than one that is fifteen
 * seconds behind, because at least the second one is honest.
 *
 * So: refetch when the screen is focused, and while it is open poll at an interval a person
 * reading a thread would not notice. The socket is named in the README's "not done here" list,
 * where it belongs, rather than half-built.
 */

/** How often an open thread asks for new messages. Slow enough not to matter to a battery. */
export const MESSAGE_POLL_MS = 15_000;

/** How many messages one page of history carries. Under the endpoint's own ceiling of 100. */
export const MESSAGE_PAGE_SIZE = 50;

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

/** How long the mention picker waits after a keystroke before it asks. */
export const MENTION_DEBOUNCE_MS = 250;

export interface ConversationList {
  items: ConversationSummary[];
  /** Conversation ids with an unread mention waiting, for the badge on a row. */
  mentioned: ReadonlySet<string>;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: unknown;
  /** True while the window can still be widened. False once the endpoint's ceiling is reached. */
  hasMore: boolean;
  refresh: () => void;
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
    // Keyed by what is actually *asked for*, not by the chip. Two chips that send the same
    // request share one cache entry and one window — switching between All and Direct is then a
    // filter over rows already on the device rather than a second identical round trip.
    queryKey: ['conversations', 'list', serverQuery, limit],
    queryFn: () =>
      apiRequest<ConversationSummary[]>('/conversations', { query: { ...serverQuery, limit } }),
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
      rows.filter(
        (row) => matchesFilter(row, filter, personalChat) && matchesSearch(row, needle),
      ),
    [rows, filter, needle, personalChat],
  );

  const { refetch } = query;
  return {
    items,
    mentioned,
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching && !query.isPlaceholderData,
    isLoadingMore: query.isPlaceholderData,
    // What is already on screen survives a failed refresh: losing the list because one poll failed
    // on a train is worse than showing the list and a message.
    error: rows.length > 0 ? null : query.error,
    hasMore: rows.length >= limit && limit < MAX_CONVERSATION_WINDOW,
    refresh: () => void refetch(),
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

export interface Thread {
  messages: MessageSummary[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingEarlier: boolean;
  error: unknown;
  hasEarlier: boolean;
  loadEarlier: () => void;
  refresh: () => void;
}

/**
 * A thread's history, oldest first.
 *
 * `useInfiniteQuery` rather than the shared `usePagedResource`, because this endpoint pages the
 * other way. `MessagePage` is oldest-first *within* a page and its cursor walks backwards into
 * history, so the pages are joined in reverse: the last page fetched is the earliest text.
 */
export function useThread(conversationId: string, poll: boolean): Thread {
  const result = useInfiniteQuery<MessagePage>({
    queryKey: ['conversations', conversationId, 'messages'],
    queryFn: ({ pageParam }) =>
      apiRequest<MessagePage>(`/conversations/${conversationId}/messages`, {
        query: { limit: MESSAGE_PAGE_SIZE, ...(pageParam ? { cursor: String(pageParam) } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: shouldRetry,
    refetchInterval: poll ? MESSAGE_POLL_MS : false,
  });

  const messages = useMemo(() => {
    const pages = result.data?.pages ?? [];
    // Reversed: page 0 is the newest window, page 1 the one before it. Read bottom-up, the
    // flattened list runs oldest to newest, which is the order a thread is displayed in.
    return [...pages].reverse().flatMap((page) => page.items);
  }, [result.data]);

  return {
    messages,
    isLoading: result.isLoading,
    isRefreshing: result.isRefetching && !result.isFetchingNextPage,
    isLoadingEarlier: result.isFetchingNextPage,
    // What is already on screen survives a failed refresh: losing the thread because one poll
    // failed on a train is worse than showing the thread and a message.
    error: messages.length > 0 ? null : result.error,
    hasEarlier: result.hasNextPage,
    loadEarlier: () => {
      if (result.hasNextPage && !result.isFetchingNextPage) {
        void result.fetchNextPage();
      }
    },
    refresh: () => void result.refetch(),
  };
}

export interface MentionAudience {
  items: MentionableUser[];
  isLoading: boolean;
}

/**
 * Who may be mentioned here, from the server and only from the server.
 *
 * The candidate set is this conversation's own audience — for a task thread, the people with a
 * place on the task — and it is the same list the send path intersects a mention against. A name
 * this offers is a name the message will reach; a name it does not offer is one the send path
 * rejects with a 400. So the picker never assembles a directory of its own, and never falls back
 * to the participants it happens to have: it asks.
 *
 * Debounced, because it opens on a keystroke. `enabled` rather than a conditional hook so the
 * query is torn down when the picker closes.
 */
export function useMentionable(
  conversationId: string,
  term: string | null,
  open: boolean,
): MentionAudience {
  const debounced = useDebounced(term, MENTION_DEBOUNCE_MS);
  const query = useQuery<MentionablePage>({
    queryKey: ['conversations', conversationId, 'mentionable', debounced ?? ''],
    queryFn: () =>
      apiRequest<MentionablePage>(`/conversations/${conversationId}/mentionable`, {
        query: { limit: DEFAULT_MENTIONABLE_LIMIT, ...(debounced ? { q: debounced } : {}) },
      }),
    enabled: open,
    retry: shouldRetry,
  });

  return { items: query.data?.items ?? [], isLoading: query.isLoading && open };
}

/** A value that stops changing until the typing does. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/** The query keys a write to a conversation makes stale. */
export function conversationKeys(conversationId: string): readonly (readonly unknown[])[] {
  return [
    ['conversations', conversationId, 'messages'],
    ['conversations', conversationId],
    ['conversations'],
    ['notifications'],
  ];
}
