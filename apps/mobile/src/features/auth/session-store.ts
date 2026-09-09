import { REFRESH_TOKEN_COOKIE, type PermissionKey, type SessionUser } from '@ashniva/types';

import {
  SECURE_KEYS,
  clearSecureSession,
  readSecure,
  readSecureJson,
  writeSecure,
  writeSecureJson,
} from '../../shared/storage/secure-store';

/**
 * The signed-in session, held in memory and backed by secure storage.
 *
 * The access token is **memory only**. It lives about fifteen minutes, and writing it to disk
 * would put a usable credential in a place that outlives the process for no benefit — the refresh
 * token already covers restarts.
 *
 * The refresh token goes to the Keychain or Keystore. On the web the API sets it as an httpOnly
 * cookie, which the browser then sends back automatically; a native app has no such jar it can
 * rely on, so the client reads the token out of the `Set-Cookie` header and presents it as a
 * `Cookie` header on refresh. The API is unchanged — it reads the same header a browser sends —
 * and the token lives somewhere the operating system encrypts.
 */

export interface Session {
  accessToken: string;
  user: SessionUser;
}

type Listener = (session: Session | null) => void;

let current: Session | null = null;
const listeners = new Set<Listener>();

/**
 * Bumped on every sign-out.
 *
 * A token refresh reads the stored token, awaits the network, and then commits. If the user signs
 * out during that await, an unconditional commit puts a live session back in memory *and* writes
 * a fresh refresh token into the Keychain the sign-out just emptied — so the next cold start
 * signs the previous person straight back in on a shared phone. Capturing this counter before the
 * await and refusing to commit when it has moved is what makes sign-out final.
 */
let generation = 0;

/** Read before an await; pass back to `setSession` to commit only if nothing has intervened. */
export function sessionGeneration(): number {
  return generation;
}

function announce() {
  for (const listener of listeners) {
    listener(current);
  }
}

export function subscribeToSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): Session | null {
  return current;
}

export function getAccessToken(): string | null {
  return current?.accessToken ?? null;
}

export function hasPermission(permission: PermissionKey): boolean {
  return current?.user.permissions.includes(permission) ?? false;
}

/**
 * Records a fresh sign-in or refresh. The refresh token is optional: a refresh may not rotate.
 *
 * `expectedGeneration` is for a caller that started before an await — a token refresh in flight.
 * Passing the value read at the start means a sign-out that happened in between wins, and the
 * commit is dropped rather than reviving the session. A fresh sign-in passes nothing.
 *
 * Returns whether it committed.
 */
export async function setSession(
  accessToken: string,
  user: SessionUser,
  refreshToken?: string | null,
  expectedGeneration?: number,
): Promise<boolean> {
  if (expectedGeneration !== undefined && expectedGeneration !== generation) {
    return false;
  }
  current = { accessToken, user };
  if (refreshToken) {
    await writeSecure(SECURE_KEYS.refreshToken, refreshToken);
  }
  await writeSecureJson(SECURE_KEYS.sessionUser, user);
  announce();
  return true;
}

/** Signs out locally: memory cleared first, so nothing can read a token mid-teardown. */
export async function clearSession(): Promise<void> {
  generation += 1;
  current = null;
  announce();
  await clearSecureSession();
}

export function getStoredRefreshToken(): Promise<string | null> {
  return readSecure(SECURE_KEYS.refreshToken);
}

/** The user from the last session, for painting the right shell before the API answers. */
export function getCachedUser(): Promise<SessionUser | null> {
  return readSecureJson<SessionUser>(SECURE_KEYS.sessionUser);
}

/**
 * Pulls the refresh token out of a `Set-Cookie` header.
 *
 * React Native concatenates multiple `Set-Cookie` headers into one comma-separated string, which
 * cannot be split on commas safely — an `Expires` attribute contains one. Matching the cookie by
 * name avoids the problem entirely.
 */
export function refreshTokenFromSetCookie(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = new RegExp(`${REFRESH_TOKEN_COOKIE}=([^;,\\s]+)`).exec(header);
  return match?.[1] ?? null;
}

/** The `Cookie` header value to present on refresh, or null when there is no stored token. */
export function refreshCookieHeader(token: string | null): string | null {
  return token ? `${REFRESH_TOKEN_COOKIE}=${token}` : null;
}

/** Test hook: resets module state between cases. Never called by the app. */
export function resetSessionForTests(): void {
  current = null;
  listeners.clear();
}
