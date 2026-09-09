import type { PaginatedResponse } from '@ashniva/types';
import { useInfiniteQuery, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { apiRequest, type QueryParams } from './client';

/**
 * Reads, through React Query.
 *
 * Two hooks, because there are two shapes: one record, and a cursor-paged list. Everything else —
 * caching, retry, pull-to-refresh, "keep what is on screen while the next page loads" — is the
 * library's job rather than a hand-rolled effect in each screen.
 *
 * The retry rule is the one deliberate choice: a 4xx is the API saying no and will say no again,
 * so only the network and the 5xx range are retried.
 */

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false;
  }
  return failureCount < 2;
}

/**
 * One record.
 *
 * `refetchInterval` is the one option a caller ever needs beyond the defaults, and only where a
 * screen has to notice somebody else's change while it is open — a conversation, a call that is
 * ringing. Pass `false` or leave it out everywhere else: a screen that polls when nothing is
 * expected to change is a screen that drains a battery to redraw the same thing.
 */
export function useResource<T>(
  key: readonly unknown[],
  path: string,
  options: {
    enabled?: boolean;
    query?: QueryParams;
    refetchInterval?: number | false;
  } = {},
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => apiRequest<T>(path, options.query ? { query: options.query } : {}),
    enabled: options.enabled ?? true,
    retry: shouldRetry,
    refetchInterval: options.refetchInterval ?? false,
  });
}

export interface PagedResult<T> {
  items: T[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  error: unknown;
  hasMore: boolean;
  refresh: () => void;
  loadMore: () => void;
}

/**
 * A cursor-paged list.
 *
 * Flattened into one array for the list to render, with the three loading states a screen
 * actually distinguishes: the first load (a spinner), a pull-to-refresh (the control's own
 * spinner), and the next page (a footer). Conflating them makes the list flash on every refresh.
 */
export function usePagedResource<T>(
  key: readonly unknown[],
  path: string,
  query: QueryParams = {},
  enabled = true,
): PagedResult<T> {
  const result = useInfiniteQuery<PaginatedResponse<T>>({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      apiRequest<PaginatedResponse<T>>(path, {
        query: { ...query, ...(pageParam ? { cursor: String(pageParam) } : {}) },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
    retry: shouldRetry,
  });

  const items = useMemo(
    () => (result.data?.pages ?? []).flatMap((page) => page.items),
    [result.data],
  );

  return {
    items,
    isLoading: result.isLoading,
    isRefreshing: result.isRefetching && !result.isFetchingNextPage,
    isLoadingMore: result.isFetchingNextPage,
    // An error does not clear what is already on screen: losing the list because the next page
    // failed is worse than showing the list and a message.
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
