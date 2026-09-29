import { skipToken, useQuery, type QueryClient } from '@tanstack/react-query';

import { isCount } from '../../shared/notifications/notification-payload';

/**
 * The unread total, as last heard from the server, for the Alerts tab badge and the app icon.
 *
 * Several answers carry it — every inbox page (either filter), the realtime `notification.new`
 * event, the one-off count `PushBootstrap` asks for at sign-in — and each writes it here. The
 * badge reads it and never fetches: `skipToken` makes the entry unfetchable, so the realtime
 * provider's `['notifications']` invalidation cannot turn the badge into a request.
 *
 * Under the `['notifications']` prefix so `queryClient.clear()` on sign-out empties it with the
 * rest of the person's data.
 */
export const UNREAD_COUNT_KEY = ['notifications', 'unread-count'] as const;

export function recordUnreadCount(client: QueryClient, count: unknown): void {
  if (isCount(count)) {
    client.setQueryData<number>(UNREAD_COUNT_KEY, count);
  }
}

/** An optimistic change after marking read; the next server answer corrects it either way. */
export function adjustUnreadCount(client: QueryClient, delta: number): void {
  const current = client.getQueryData<number>(UNREAD_COUNT_KEY);
  if (current !== undefined) {
    client.setQueryData<number>(UNREAD_COUNT_KEY, Math.max(0, current + delta));
  }
}

/** The count, or null before anything has reported one — "no badge" rather than a guess. */
export function useKnownUnreadCount(): number | null {
  const query = useQuery<number>({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: skipToken,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return query.data ?? null;
}

export function useCachedUnreadCount(): number {
  return useKnownUnreadCount() ?? 0;
}
