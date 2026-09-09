import { Link, useLocation } from 'react-router';

import { useCurrentUser } from '../../features/auth/session-context';
import { activeNavigationTo } from './active-navigation';
import { mobileItems, navigationFor } from './navigation';

interface MobileTabBarProps {
  onMore: () => void;
}

/** Phone-only bottom tab bar (Home · Tasks · Tickets · … · More) from the approved mobile flows. */
export function MobileTabBar({ onMore }: MobileTabBarProps) {
  const user = useCurrentUser();
  const location = useLocation();
  const groups = navigationFor(user);
  const items = mobileItems(groups);
  // Matched over the tabs only: a phone tab stands for a whole section, so /tasks?view=today still
  // belongs to the Tasks tab even though the sidebar would pick "My tasks today".
  const activeTo = activeNavigationTo([{ items }], location.pathname, location.search);
  return (
    <nav className="app-tabbar" aria-label="Primary">
      {items.map((item) => {
        const active = item.to === activeTo;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={['app-tabbar__item', active ? 'app-tabbar__item--active' : '']
              .filter(Boolean)
              .join(' ')}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
      <button type="button" className="app-tabbar__item" onClick={onMore}>
        More
      </button>
    </nav>
  );
}
