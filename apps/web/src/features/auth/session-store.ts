import type { SessionUser } from '@ashniva/types';

/**
 * The session lives in memory only: the access token is never written to localStorage or
 * sessionStorage (approved architecture). Reloading the page recovers the session through the
 * httpOnly refresh cookie (see SessionProvider), so nothing sensitive is reachable by scripts.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'anonymous';

export interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: SessionUser | null;
}

let state: SessionState = { status: 'loading', accessToken: null, user: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getSessionState(): SessionState {
  return state;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

export function setAuthenticated(accessToken: string, user: SessionUser): void {
  state = { status: 'authenticated', accessToken, user };
  emit();
}

export function setAnonymous(): void {
  state = { status: 'anonymous', accessToken: null, user: null };
  emit();
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
