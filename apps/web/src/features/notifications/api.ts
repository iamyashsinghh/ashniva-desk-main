import type {
  NotificationListResponse,
  NotificationPreferenceEntry,
  NotificationPreferences,
} from '@ashniva/types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

/** Notifications asked for per page. The endpoint answers with a cursor for the page after. */
export const NOTIFICATION_PAGE_SIZE = 50;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unread: boolean) => ['notifications', 'list', unread] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  preferences: ['notifications', 'preferences'] as const,
};

/**
 * The inbox, paged.
 *
 * `useInfiniteQuery` rather than `useQuery`: the endpoint has always answered with a
 * `nextCursor` and this screen used to throw it away, so an inbox longer than one page simply
 * ended — the older notifications were in the database with no way to reach them.
 */
export function useNotificationsQuery(unread = false) {
  return useInfiniteQuery({
    queryKey: notificationKeys.list(unread),
    queryFn: ({ pageParam }) =>
      apiRequest<NotificationListResponse>('/notifications', {
        query: {
          unread: unread || undefined,
          limit: NOTIFICATION_PAGE_SIZE,
          cursor: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** Cheap poll as a fallback for the realtime `notification.new` event. */
export function useUnreadCountQuery() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () => apiRequest<{ unreadCount: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
}

export function useNotificationPreferencesQuery() {
  return useQuery({
    queryKey: notificationKeys.preferences,
    queryFn: () => apiRequest<NotificationPreferences>('/notifications/preferences'),
  });
}

export interface NotificationPreferencesInput {
  entries?: NotificationPreferenceEntry[];
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  return {
    markRead: useMutation({
      mutationFn: (id: string) => apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' }),
      onSuccess: invalidate,
    }),
    markAllRead: useMutation({
      mutationFn: () => apiRequest<void>('/notifications/read-all', { method: 'POST' }),
      onSuccess: invalidate,
    }),
    savePreferences: useMutation({
      mutationFn: (body: NotificationPreferencesInput) =>
        apiRequest<NotificationPreferences>('/notifications/preferences', { method: 'PUT', body }),
      onSuccess: invalidate,
    }),
  };
}
