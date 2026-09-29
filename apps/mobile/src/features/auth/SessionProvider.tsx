import type { AcceptInvitationRequest, PermissionKey, SessionUser } from '@ashniva/types';
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

import {
  acceptInvitation as acceptInvitationRequest,
  switchOrganization as switchOrganizationRequest,
} from './account-api';
import { login as loginRequest, logout as logoutRequest, restoreSession } from './auth-api';
import { unregisterPushDevice } from '../../shared/notifications/push-registration';
import { subscribeToSession, updateSessionUser } from './session-store';

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
  /** Sets the first password from an invitation link and signs the new person in. */
  acceptInvitation: (input: AcceptInvitationRequest) => Promise<void>;
  /** Moves the session to another organization in `user.organizations`. */
  switchOrganization: (organizationId: string) => Promise<void>;
  /** Applies a change the API has already accepted to the signed-in person, such as a picture. */
  updateUser: (change: (user: SessionUser) => SessionUser) => void;
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
  // expired session takes the app back to sign-in wherever it happens, not only on launch — and
  // that an app started offline becomes signed-in the first time a refresh gets through.
  useEffect(
    () =>
      subscribeToSession((session) => {
        if (!session) {
          setStatus('signed-out');
          setUser(null);
          queryClient.clear();
          return;
        }
        setStatus((previous) => (previous === 'offline' ? 'signed-in' : previous));
      }),
    [queryClient],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const signedIn = await loginRequest(email, password);
    setUser(signedIn);
    setStatus('signed-in');
  }, []);

  const acceptInvitation = useCallback(async (input: AcceptInvitationRequest) => {
    const signedIn = await acceptInvitationRequest(input);
    setUser(signedIn);
    setStatus('signed-in');
  }, []);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const switched = await switchOrganizationRequest(organizationId);
      // Every cached answer belongs to the organization just left. Requests still in flight are
      // cancelled first so a late reply cannot write the old organization's rows back in after the
      // clear.
      await queryClient.cancelQueries();
      queryClient.clear();
      setUser(switched);
      setStatus('signed-in');
    },
    [queryClient],
  );

  const updateUser = useCallback((change: (user: SessionUser) => SessionUser) => {
    setUser((previous) => (previous ? change(previous) : previous));
    void updateSessionUser(change);
  }, []);

  const signOut = useCallback(async () => {
    // Before the logout, while there is still a token to authenticate with: a phone handed to the
    // next person must stop receiving the previous person's alerts.
    await unregisterPushDevice();
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
      acceptInvitation,
      switchOrganization,
      updateUser,
      signOut,
    }),
    [status, user, signIn, acceptInvitation, switchOrganization, updateUser, signOut],
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
