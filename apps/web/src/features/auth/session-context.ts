import { isClientRole, type PermissionKey, type SessionUser } from '@ashniva/types';
import { useSyncExternalStore } from 'react';

import { getSessionState, subscribeToSession, type SessionState } from './session-store';

/** Reactive view of the in-memory session (see session-store.ts). */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribeToSession, getSessionState, getSessionState);
}

/** The signed-in user; only call inside routes protected by RequireAuth. */
export function useCurrentUser(): SessionUser {
  const { user } = useSession();
  if (!user) {
    throw new Error('useCurrentUser must be used inside an authenticated route');
  }
  return user;
}

/** Hides UI only — the API enforces the same permission on every request. */
export function usePermission(permission: PermissionKey): boolean {
  const { user } = useSession();
  return user?.permissions.includes(permission) ?? false;
}

export function isClientSession(user: SessionUser | null): boolean {
  return user !== null && isClientRole(user.roleKey);
}

/** Home route for a user: clients live under /portal, everyone else under /. */
export function homePathFor(user: SessionUser | null): string {
  return isClientSession(user) ? '/portal' : '/';
}
