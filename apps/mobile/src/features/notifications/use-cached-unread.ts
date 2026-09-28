import type { NotificationListResponse } from '@ashniva/types';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';

/**
 * The unread total the inbox last loaded, read from the cache and never fetched.
 *
 * For the badge on the Alerts tab. The badge must not be the reason a request is made: the
 * inbox asks when somebody opens it or Home, as it always has, and the badge simply shows what
 * that answer said. Before the inbox has loaded once there is no badge rather than a guess.
 */
export function useCachedUnreadCount(): number {
  const client = useQueryClient();
  const read = useCallback(() => {
    const data = client.getQueryData<InfiniteData<NotificationListResponse>>(['notifications']);
    return data?.pages[0]?.unreadCount ?? 0;
  }, [client]);
  const subscribe = useCallback(
    (onChange: () => void) => client.getQueryCache().subscribe(onChange),
    [client],
  );
  return useSyncExternalStore(subscribe, read, read);
}
