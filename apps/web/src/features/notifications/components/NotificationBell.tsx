import { Link } from 'react-router';

import { useUnreadCountQuery } from '../api';

/** Topbar bell: unread badge fed by the query the realtime `notification.new` event refreshes. */
export function NotificationBell({ to }: { to: string }) {
  const unread = useUnreadCountQuery();
  const count = unread.data?.unreadCount ?? 0;
  return (
    <Link
      to={to}
      className="app-topbar__bell"
      aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <span aria-hidden="true">🔔</span>
      {count > 0 ? (
        <span className="app-topbar__bell-count" data-testid="unread-count">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
