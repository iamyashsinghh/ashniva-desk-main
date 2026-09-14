import { Drawer } from '@ashniva/ui';
import { useState } from 'react';
import { Outlet, useMatches } from 'react-router';

import { LiveMessageToasts } from '../../features/communication/components/LiveMessageToasts';
import { MessengerDock } from '../../features/communication/components/MessengerDock';
import { MessengerProvider } from '../../features/communication/messenger-context';
import { RealtimeProvider } from '../providers/RealtimeProvider';
import { MobileTabBar } from './MobileTabBar';
import { Sidebar, SidebarPanel } from './Sidebar';
import { Topbar } from './Topbar';

import './app-shell.css';

/** Route handles may carry a page title used by the top bar. */
export interface RouteHandle {
  title?: string;
}

interface AppShellProps {
  /** "/" for the internal app, "/portal" for the client portal. */
  homePath?: string;
}

/**
 * Application shell: sidebar + top bar + content on desktop; drawer sidebar, top bar and a
 * bottom tab bar on phones. Used by both the internal app and the client portal.
 *
 * The phone sidebar is a `Drawer` rather than a `<nav>` slid in with a transform and a `<button>`
 * standing in for a backdrop. That hand-rolled version left focus on the page behind it, could
 * not be closed with Escape, and kept every link in it tabbable while it was off screen. A modal
 * `<dialog>` gets all three right in the browser rather than in this file.
 */
export function AppShell({ homePath = '/' }: AppShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const matches = useMatches();
  const title = findTitle(matches) ?? 'Ashniva Desk';
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <RealtimeProvider>
      <div className="app-shell">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <Sidebar onNavigate={closeSidebar} homePath={homePath} />
        <Drawer open={isSidebarOpen} title="Menu" side="start" onClose={closeSidebar}>
          <SidebarPanel onNavigate={closeSidebar} homePath={homePath} />
        </Drawer>
        <div className="app-main">
          <Topbar
            title={title}
            isSidebarOpen={isSidebarOpen}
            onToggleSidebar={() => setSidebarOpen((open) => !open)}
            homePath={homePath}
          />
          <main id="main-content" className="app-content" tabIndex={-1}>
            <Outlet />
          </main>
          <MobileTabBar onMore={() => setSidebarOpen(true)} />
        </div>
        {/* Mounted here rather than on the messages screen: a message arriving while somebody is
            on a task board is exactly the case a corner notice is for. */}
        <MessengerProvider>
          <LiveMessageToasts />
          <MessengerDock />
        </MessengerProvider>
      </div>
    </RealtimeProvider>
  );
}

function findTitle(matches: ReturnType<typeof useMatches>): string | undefined {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index]?.handle as RouteHandle | undefined;
    if (handle?.title) {
      return handle.title;
    }
  }
  return undefined;
}
