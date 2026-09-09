import type { NotificationListResponse, NotificationSummary } from '@ashniva/types';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';

/**
 * The inbox, paged.
 *
 * `useInfiniteQuery` rather than the shared `usePagedResource`, because this endpoint answers with
 * an unread total alongside the page and a screen that dropped it would have nothing to put on the
 * "mark all as read" button. The paging itself is the ordinary kind: the endpoint has always
 * answered with a `nextCursor` and this screen used to throw it away, so anything older than the
 * first page was in the database with no way to reach it.
 */

/** Notifications per page. Enough to fill a phone screen several times over. */
export const NOTIFICATION_PAGE_SIZE = 30;

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

export function useInbox(): Inbox {
  const result = useInfiniteQuery<NotificationListResponse>({
    queryKey: ['notifications'],
    queryFn: ({ pageParam }) =>
      apiRequest<NotificationListResponse>('/notifications', {
        query: {
          limit: NOTIFICATION_PAGE_SIZE,
          ...(pageParam ? { cursor: String(pageParam) } : {}),
        },
      }),
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
