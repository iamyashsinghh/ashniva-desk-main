import { ROLE_LABELS } from '@ashniva/types';
import { Link, useLocation } from 'react-router';

import { brandingLogoSrc } from '../../features/branding/api';
import { useCurrentUser } from '../../features/auth/session-context';
import { useBranding } from '../providers/branding-context';
import { activeNavigationTo } from './active-navigation';
import { ColorSchemeToggle } from './ColorSchemeToggle';
import { navigationFor, type NavigationItem } from './navigation';

interface SidebarProps {
  onNavigate: () => void;
  homePath: string;
}

/**
 * The permanent sidebar. Hidden below 900px, where the same links arrive in a `Drawer` instead.
 *
 * `display: none` rather than the old off-screen transform, so that on a phone there is one
 * "Main navigation" landmark rather than two — one of them off the side of the screen and still
 * in the accessibility tree, with every link in it still a tab stop.
 */
export function Sidebar({ onNavigate, homePath }: SidebarProps) {
  return (
    <nav id="app-sidebar" className="app-sidebar" aria-label="Main navigation">
      <SidebarBrand homePath={homePath} onNavigate={onNavigate} />
      <SidebarLinks onNavigate={onNavigate} />
      <SidebarFooter homePath={homePath} onNavigate={onNavigate} />
    </nav>
  );
}

/**
 * The same links, for the phone drawer.
 *
 * No `nav` of its own: the `Drawer` is a modal dialog with its own accessible name, and a
 * landmark inside a dialog is a landmark nobody can navigate to.
 */
export function SidebarPanel({ onNavigate, homePath }: SidebarProps) {
  return (
    <div className="app-sidebar app-sidebar--panel">
      <SidebarLinks onNavigate={onNavigate} />
      <SidebarFooter homePath={homePath} onNavigate={onNavigate} />
      {/* The top bar's copy is hidden on a phone, where there is no room for it. */}
      <ColorSchemeToggle className="app-sidebar__scheme" />
    </div>
  );
}

function SidebarBrand({ homePath, onNavigate }: SidebarProps) {
  const { branding } = useBranding();
  const logoSrc = brandingLogoSrc(branding);
  return (
    <Link to={homePath} className="app-sidebar__brand" onClick={onNavigate}>
      <span className="app-sidebar__logo" aria-hidden="true">
        {logoSrc ? <img src={logoSrc} alt="" /> : branding.logoText}
      </span>
      {branding.productName}
    </Link>
  );
}

function SidebarLinks({ onNavigate }: { onNavigate: () => void }) {
  const user = useCurrentUser();
  const location = useLocation();
  const groups = navigationFor(user);
  const activeTo = activeNavigationTo(groups, location.pathname, location.search);
  return (
    <>
      {groups.map((group, index) => (
        <div key={group.heading ?? index}>
          {group.heading ? <div className="app-sidebar__heading">{group.heading}</div> : null}
          {group.items.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              isActive={item.to === activeTo}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ))}
    </>
  );
}

function SidebarFooter({ homePath, onNavigate }: SidebarProps) {
  const user = useCurrentUser();
  return (
    <div className="app-sidebar__footer">
      <Link
        to={`${homePath === '/' ? '' : homePath}/profile`}
        className="app-sidebar__user"
        onClick={onNavigate}
      >
        <span className="app-sidebar__user-name">{user.name}</span>
        <span className="app-sidebar__user-role">{user.roleName || ROLE_LABELS[user.roleKey]}</span>
        <span className="app-sidebar__user-org">{user.organization.name}</span>
      </Link>
    </div>
  );
}

function SidebarLink({
  item,
  isActive,
  onNavigate,
}: {
  item: NavigationItem;
  isActive: boolean;
  onNavigate: () => void;
}) {
  if (item.unavailable) {
    return (
      <Link
        to={item.to}
        className="app-sidebar__link app-sidebar__link--unavailable"
        onClick={onNavigate}
      >
        {item.label}
        <span className="app-sidebar__phase">Phase 2</span>
      </Link>
    );
  }
  // A plain Link, not a NavLink: NavLink matches on the pathname alone and defaults aria-current
  // to "page", which would mark every /tasks item active at once. activeNavigationTo decides.
  return (
    <Link
      to={item.to}
      className={['app-sidebar__link', isActive ? 'app-sidebar__link--active' : '']
        .filter(Boolean)
        .join(' ')}
      aria-current={isActive ? 'page' : undefined}
      onClick={onNavigate}
    >
      {item.label}
    </Link>
  );
}
