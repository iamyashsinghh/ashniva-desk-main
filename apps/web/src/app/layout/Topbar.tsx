import { PERMISSIONS } from '@ashniva/types';
import { Avatar, Button, DropdownMenu, type MenuItem } from '@ashniva/ui';
import { Link, useNavigate } from 'react-router';

import { logout } from '../../features/auth/api';
import { useCurrentUser, usePermission } from '../../features/auth/session-context';
import { NotificationBell } from '../../features/notifications/components/NotificationBell';
import { GlobalSearch } from '../../features/search/components/GlobalSearch';
import { ColorSchemeToggle } from './ColorSchemeToggle';

interface TopbarProps {
  title: string;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  homePath: string;
}

export function Topbar({ title, isSidebarOpen, onToggleSidebar, homePath }: TopbarProps) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const canCreateTask = usePermission(PERMISSIONS.TASK_CREATE);
  const canRaiseTicket = usePermission(PERMISSIONS.TICKET_RAISE);
  const isPortal = homePath === '/portal';
  const profilePath = isPortal ? '/portal/profile' : '/profile';

  async function handleLogout() {
    await logout();
    void navigate('/login', { replace: true });
  }

  const items: MenuItem[] = [
    { key: 'profile', label: 'Profile & password', href: profilePath },
    { key: 'logout', label: 'Sign out', onSelect: () => void handleLogout() },
  ];

  return (
    <header className="app-topbar">
      <Button
        className="app-topbar__menu-button"
        size="sm"
        onClick={onToggleSidebar}
        aria-expanded={isSidebarOpen}
      >
        Menu
      </Button>
      <h1 className="app-topbar__title">{title}</h1>
      <span className="app-topbar__spacer" />
      {/* No permission check: what a search may answer is decided per module by the API, and a
          box hidden here would only hide the affordance, never the endpoint. */}
      <GlobalSearch resultsPath={isPortal ? '/portal/search' : '/search'} />
      {!isPortal && canCreateTask ? (
        <Button size="sm" variant="primary" onClick={() => void navigate('/tasks/new')}>
          + New task
        </Button>
      ) : null}
      {canRaiseTicket ? (
        <Button
          size="sm"
          variant={isPortal ? 'primary' : 'secondary'}
          onClick={() => void navigate(isPortal ? '/portal/tickets/new' : '/tickets/new')}
        >
          + Ticket
        </Button>
      ) : null}
      <ColorSchemeToggle className="app-topbar__scheme" />
      <NotificationBell to={isPortal ? '/portal/notifications' : '/notifications'} />
      {/*
        Was a `role="menu"` div opened on click and nothing else: no arrow keys, no Escape, no
        close on a press elsewhere, and focus left on the trigger while the menu was open — a role
        that promises keyboard behaviour, with none of it. `DropdownMenu` keeps the promise.
      */}
      <DropdownMenu
        className="app-topbar__user"
        triggerLabel={`Account menu for ${user.name}`}
        trigger={<Avatar name={user.name} size="sm" />}
        header={
          <>
            <strong>{user.name}</strong>
            <span>{user.roleName}</span>
          </>
        }
        items={items}
        renderLink={(href, label, props) => (
          <Link to={href} {...props}>
            {label}
          </Link>
        )}
      />
    </header>
  );
}
