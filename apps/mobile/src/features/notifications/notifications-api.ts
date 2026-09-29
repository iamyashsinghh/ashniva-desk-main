import type { NotificationListResponse, NotificationSummary } from '@ashniva/types';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';
import { adjustUnreadCount, recordUnreadCount } from './use-cached-unread';

/**
 * The inbox, paged.
 *
 * `useInfiniteQuery` rather than the shared `usePagedResource`, because this endpoint answers with
 * an unread total alongside the page and a screen that dropped it would have nothing to put on the
 * "mark all as read" button. The paging itself is the ordinary kind: the endpoint answers with a
 * `nextCursor`, and anything older than the first page is reached by following it.
 */

/** Notifications per page. Enough to fill a phone screen several times over. */
export const NOTIFICATION_PAGE_SIZE = 30;

export type InboxFilter = 'unread' | 'all';

export const inboxKey = (filter: InboxFilter) => ['notifications', 'inbox', filter] as const;

type InboxData = InfiniteData<NotificationListResponse, string | null>;

export interface Inbox {
  items: NotificationSummary[];
  unreadCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
}

export function useInbox(filter: InboxFilter = 'all'): Inbox {
  const client = useQueryClient();
  const result = useInfiniteQuery({
    queryKey: inboxKey(filter),
    queryFn: async ({ pageParam }) => {
      const page = await apiRequest<NotificationListResponse>('/notifications', {
        query: {
          limit: NOTIFICATION_PAGE_SIZE,
          ...(filter === 'unread' ? { unread: true } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      });
      // Recorded from the fetch, not from rendered data, so a stale cached page shown on remount
      // cannot overwrite a newer count that arrived over the socket.
      recordUnreadCount(client, page.unreadCount);
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry: shouldRetry,
  });

  const items = useMemo(
    () => (result.data?.pages ?? []).flatMap((page) => page.items),
    [result.data],
  );

  return {
    items,
    // The unread count is a total rather than a page's worth; every page carries the same one.
    unreadCount: result.data?.pages[0]?.unreadCount ?? 0,
    isLoading: result.isLoading,
    isRefreshing: result.isRefetching && !result.isFetchingNextPage,
    isLoadingMore: result.isFetchingNextPage,
    // What is already on screen survives a failed page: losing the inbox because the next page
    // failed on a train is worse than showing the inbox and a message.
    error: items.length > 0 ? null : result.error,
    hasMore: result.hasNextPage,
    refresh: () => void result.refetch(),
    loadMore: () => {
      if (result.hasNextPage && !result.isFetchingNextPage) {
        void result.fetchNextPage();
      }
    },
  };
}

/**
 * Cached pages with the given notifications marked read (`ids` null means all of them).
 *
 * The unread total drops by the number actually changed, so marking a row that was already read
 * elsewhere does not push the count below the truth.
 */
export function markReadInPages(
  data: InboxData,
  ids: ReadonlySet<string> | null,
  readAt: string,
): InboxData {
  let changed = 0;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((item) => {
      if (item.readAt || (ids && !ids.has(item.id))) {
        return item;
      }
      changed += 1;
      return { ...item, readAt };
    }),
  }));
  return {
    ...data,
    pages: pages.map((page) => ({
      ...page,
      unreadCount: ids ? Math.max(0, page.unreadCount - changed) : 0,
    })),
  };
}

/**
 * Marking read, on the server rather than locally so the badge agrees across the phone and the
 * web. The cache is updated first so the row and the badge react at once; the refetch afterwards
 * replaces the guess with the server's answer.
 */
export function useNotificationActions() {
  const client = useQueryClient();

  const patch = useCallback(
    (ids: ReadonlySet<string> | null) => {
      const readAt = new Date().toISOString();
      client.setQueriesData<InboxData>({ queryKey: ['notifications', 'inbox'] }, (data) =>
        data ? markReadInPages(data, ids, readAt) : data,
      );
    },
    [client],
  );

  const markRead = useCallback(
    async (item: NotificationSummary) => {
      if (item.readAt) {
        return;
      }
      patch(new Set([item.id]));
      adjustUnreadCount(client, -1);
      try {
        await apiRequest(`/notifications/${item.id}/read`, { method: 'POST' });
      } catch {
        // Reading a notification is not worth an error dialog; the refetch restores the truth.
      }
      void client.invalidateQueries({ queryKey: ['notifications', 'inbox'] });
    },
    [client, patch],
  );

  const markAllRead = useCallback(async () => {
    patch(null);
    recordUnreadCount(client, 0);
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
    } catch {
      // The refetch below puts the unread rows back, which is the honest answer.
    }
    void client.invalidateQueries({ queryKey: ['notifications', 'inbox'] });
  }, [client, patch]);

  return { markRead, markAllRead };
}
