import {
  DEFAULT_MENTIONABLE_LIMIT,
  type ConversationAudienceMember,
  type MentionablePage,
  type MentionableUser,
  type MessagePage,
  type MessageRevisionSummary,
  type MessageSummary,
} from '@ashniva/types';
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';
import { isMessageOf, threadMessages, upsertMessage } from './live-thread';

export {
  CONVERSATION_PAGE_SIZE,
  MAX_CONVERSATION_WINDOW,
  useConversationList,
  useUnreadMentions,
  type ConversationList,
} from './conversation-list-api';

/**
 * Reading conversations and threads.
 *
 * **Live over the socket, polling only as the fallback.** The realtime provider refreshes every
 * `conversations` query when the gateway reports a message, an edit, a read or a call — the same
 * map the web app uses — and an open thread also splices an arriving message straight into its
 * cache (`use-live-conversation.ts`). The socket is closed while the app is in the background and
 * reopened, followed by a full refetch, when it returns.
 *
 * While there is no socket — it has not connected yet, the radio dropped it, or the gateway is
 * unreachable — an open thread polls at an interval a person reading would not notice. A thread
 * that silently stopped updating is worse than one fifteen seconds behind, so the poll is not
 * removed, only switched off while something better is running.
 */

/** How often an open thread asks for new messages while there is no socket. */
export const MESSAGE_POLL_MS = 15_000;

/** How many messages one page of history carries. Under the endpoint's own ceiling of 100. */
export const MESSAGE_PAGE_SIZE = 50;

/** How long the mention picker waits after a keystroke before it asks. */
export const MENTION_DEBOUNCE_MS = 250;

/** The cache key of a thread's history. The live splice writes to exactly this entry. */
export function threadKey(conversationId: string) {
  return ['conversations', conversationId, 'messages'] as const;
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
    queryKey: threadKey(conversationId),
    queryFn: ({ pageParam }) =>
      apiRequest<MessagePage>(`/conversations/${conversationId}/messages`, {
        query: { limit: MESSAGE_PAGE_SIZE, ...(pageParam ? { cursor: String(pageParam) } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: shouldRetry,
    refetchInterval: poll ? MESSAGE_POLL_MS : false,
  });

  const messages = useMemo(() => threadMessages(result.data), [result.data]);

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

/**
 * Everybody who may read this conversation, with their names.
 *
 * The participant rows are not that list: a project channel's rows are read cursors, written for
 * whoever happened to open it, so a mention of somebody who never has would render as "@someone"
 * and a private line's recipients could not be named. The audience is the server's own answer —
 * the same set the send path checks a mention against — and it is one request per thread.
 */
export function useConversationAudience(conversationId: string): ConversationAudienceMember[] {
  const query = useQuery<ConversationAudienceMember[]>({
    queryKey: ['conversations', conversationId, 'audience'],
    queryFn: () =>
      apiRequest<ConversationAudienceMember[]>(`/conversations/${conversationId}/audience`),
    retry: shouldRetry,
    // A roster does not change between two messages, and every message event refreshes the tree.
    staleTime: 30_000,
  });
  return useMemo(() => query.data ?? [], [query.data]);
}

/**
 * What an edited message said before, for somebody reading on oversight.
 *
 * Keyed outside the `conversations` tree on purpose. Every read of a revision is an audited access
 * on the server, and every message event invalidates that tree: kept inside it, an open revision
 * list would write a fresh audit row each time anybody in the thread said anything.
 */
export function useMessageRevisions(conversationId: string, messageId: string, enabled: boolean) {
  return useQuery<MessageRevisionSummary[]>({
    queryKey: ['message-revisions', conversationId, messageId],
    queryFn: () =>
      apiRequest<MessageRevisionSummary[]>(
        `/conversations/${conversationId}/messages/${messageId}/revisions`,
      ),
    enabled,
    retry: shouldRetry,
    staleTime: Infinity,
  });
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
    // The previous answer stays while the next term is asked for, so the list narrows instead of
    // blanking to "Looking…" between keystrokes; a roster does not change between two of them.
    placeholderData: (previous) => previous,
    staleTime: 30_000,
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
    threadKey(conversationId),
    ['conversations', conversationId],
    ['conversations'],
    ['notifications'],
  ];
}

/**
 * After this viewer's own send or edit: their copy goes into the thread at once, and the rest of
 * the tree is refreshed behind it.
 *
 * Not awaited. Waiting on the refetch — which walks every loaded page — is what kept a sent line in
 * the composer and an edit's spinner turning for seconds after the server had answered.
 */
export function landOwnMessage(
  queryClient: QueryClient,
  conversationId: string,
  result: unknown,
): void {
  if (isMessageOf(result, conversationId)) {
    queryClient.setQueryData<InfiniteData<MessagePage>>(threadKey(conversationId), (data) =>
      upsertMessage(data, result),
    );
  }
  for (const queryKey of conversationKeys(conversationId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
