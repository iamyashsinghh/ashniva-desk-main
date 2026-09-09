import { useEffect, type ReactNode } from 'react';

import { restoreSession } from './api';
import { getSessionState } from './session-store';

/**
 * On first load, tries to recover the session from the refresh cookie. Until that settles the
 * session status is "loading", which RequireAuth turns into a spinner instead of a redirect.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (getSessionState().status === 'loading') {
      void restoreSession();
    }
  }, []);
  return children;
}
