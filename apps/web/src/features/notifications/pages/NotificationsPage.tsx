import { NOTIFICATION_TYPE_LABELS, type NotificationSummary } from '@ashniva/types';
import { Badge, Button, Card, EmptyState, PageHeader, SegmentedControl, Tabs } from '@ashniva/ui';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatRelative } from '../../../shared/lib/format';
import {
  useNotificationMutations,
  useNotificationPreferencesQuery,
  useNotificationsQuery,
} from '../api';
import { NotificationPreferencesCard } from '../components/NotificationPreferencesCard';

import '../../dashboard/dashboard.css';
import '../../tasks/tasks.css';
import '../notifications.css';

type Tab = 'inbox' | 'preferences';

/** Notification center: the inbox (unread first) and the person's delivery preferences. */
export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'inbox') as Tab;
  const filter = params.get('filter') === 'all' ? 'all' : 'unread';
  const list = useNotificationsQuery(filter === 'unread');
  const preferences = useNotificationPreferencesQuery();
  const { markRead, markAllRead } = useNotificationMutations();
  const navigate = useNavigate();
  const items = useMemo(
    () => (list.data?.pages ?? []).flatMap((page) => page.items),
    [list.data?.pages],
  );
  // The badge is a total, not a page: every page carries the same one, so the first will do.
  const unreadCount = list.data?.pages[0]?.unreadCount ?? 0;

  async function open(notification: NotificationSummary) {
    if (!notification.readAt) {
      await markRead.mutateAsync(notification.id);
    }
    if (notification.link) {
      void navigate(notification.link);
    }
  }

  return (
    <div className="dashboard">
      <PageHeader
        title="Notifications"
        subtitle={list.data ? `${unreadCount} unread` : undefined}
        actions={
          tab === 'inbox' && unreadCount > 0 ? (
            <Button
              size="sm"
              loading={markAllRead.isPending}
              onClick={() => void markAllRead.mutateAsync()}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      >
        <Tabs
          aria-label="Notification sections"
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          items={[
            { key: 'inbox', label: 'Inbox' },
            { key: 'preferences', label: 'Preferences' },
          ]}
        />
      </PageHeader>
      {tab === 'inbox' ? (
        <Card
          title="Inbox"
          headerAddon={
            <SegmentedControl
              aria-label="Filter"
              size="sm"
              value={filter}
              onChange={(next) => setParams({ tab: 'inbox', filter: next }, { replace: true })}
              options={[
                { key: 'unread', label: 'Unread' },
                { key: 'all', label: 'All' },
              ]}
            />
          }
        >
          <QueryState
            isLoading={list.isLoading}
            isError={list.isError}
            error={list.error}
            onRetry={() => void list.refetch()}
          >
            {list.data && items.length === 0 ? (
              <EmptyState
                title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
              />
            ) : (
              <ul className="notification-list">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={`notification${notification.readAt ? '' : ' notification--unread'}`}
                      onClick={() => void open(notification)}
                    >
                      <span className="notification__title">
                        {notification.title}
                        {notification.groupedCount > 1 ? (
                          <Badge tone="neutral">×{notification.groupedCount}</Badge>
                        ) : null}
                      </span>
                      {notification.body ? (
                        <span className="notification__body">{notification.body}</span>
                      ) : null}
                      <span className="notification__meta">
                        {NOTIFICATION_TYPE_LABELS[notification.type]} ·{' '}
                        {formatRelative(notification.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {list.hasNextPage ? (
              <div className="form-actions" style={{ marginTop: 12 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={list.isFetchingNextPage}
                  onClick={() => void list.fetchNextPage()}
                >
                  Load older notifications
                </Button>
              </div>
            ) : null}
          </QueryState>
        </Card>
      ) : (
        <QueryState
          isLoading={preferences.isLoading}
          isError={preferences.isError}
          error={preferences.error}
          onRetry={() => void preferences.refetch()}
        >
          {preferences.data ? (
            <NotificationPreferencesCard
              key={preferences.dataUpdatedAt}
              preferences={preferences.data}
            />
          ) : null}
        </QueryState>
      )}
    </div>
  );
}
