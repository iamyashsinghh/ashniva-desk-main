import type { PermissionKey, SessionUser } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { login as loginRequest, logout as logoutRequest, restoreSession } from './auth-api';
import { subscribeToSession } from './session-store';

/**
 * The session, as the screens see it.
 *
 * `status` is four states rather than a boolean, because the difference matters to what is drawn:
 *
 * - `restoring` — the splash screen. We do not yet know.
 * - `signed-in` — the session was checked against the API just now.
 * - `offline` — there is a stored session but it could not be checked. The app works from cache
 *   and says so, rather than throwing someone out because they opened it on the underground.
 * - `signed-out` — no session, or the API refused the stored one.
 */

export type SessionStatus = 'restoring' | 'signed-in' | 'offline' | 'signed-out';

interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  can: (permission: PermissionKey) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('restoring');
  const [user, setUser] = useState<SessionUser | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let live = true;
    void restoreSession().then((result) => {
      if (!live) {
        return;
      }
      setStatus(result.status);
      setUser(result.status === 'signed-out' ? null : result.user);
    });
    return () => {
      live = false;
    };
  }, []);

  // The API client clears the session when a refresh is refused mid-use. Subscribing means an
  // expired session takes the app back to sign-in wherever it happens, not only on launch.
  useEffect(
    () =>
      subscribeToSession((session) => {
        if (!session) {
          setStatus('signed-out');
          setUser(null);
          queryClient.clear();
        }
      }),
    [queryClient],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await loginRequest(email, password);
    setUser(signedIn);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus('signed-out');
    // Tokens are not the only thing signing out has to remove. The query cache holds whatever the
    // last person looked at — their tasks, their tickets, a client's invoices — and the client is
    // one long-lived object for the whole app. Without this, the next person to sign in on the
    // same phone is served the previous person's data from cache while their own request is still
    // in flight.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      can: (permission) => user?.permissions.includes(permission) ?? false,
      signIn,
      signOut,
    }),
    [status, user, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside a SessionProvider');
  }
  return value;
}

/** Convenience for the common case: one permission, boolean answer. */
export function usePermission(permission: PermissionKey): boolean {
  return useSession().can(permission);
}
