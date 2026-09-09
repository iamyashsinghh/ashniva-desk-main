import type { SessionUser } from '@ashniva/types';

import { mobileEnv } from '../../config/env';
import { apiRequest, NetworkError } from '../../shared/api/client';
import {
  clearSession,
  getCachedUser,
  getStoredRefreshToken,
  refreshCookieHeader,
  refreshTokenFromSetCookie,
  setSession,
} from './session-store';

/**
 * Signing in, restoring a session, and signing out.
 *
 * Login talks to `fetch` directly rather than through `apiRequest`, because it is the one call
 * that must read a response header — the refresh token arrives as `Set-Cookie`, and the shared
 * client deliberately deals only in bodies.
 */

interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  let response: Response;
  try {
    response = await fetch(`${mobileEnv.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new NetworkError('Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    // The API answers 401 for both a wrong password and an unknown address, on purpose. Repeating
    // that here rather than guessing keeps the app from leaking which accounts exist.
    throw new Error(
      response.status === 401
        ? 'That email and password did not match'
        : 'Could not sign in right now',
    );
  }

  const payload = (await response.json()) as LoginResponse;
  const refreshToken = refreshTokenFromSetCookie(response.headers.get('set-cookie'));
  await setSession(payload.accessToken, payload.user, refreshToken);
  return payload.user;
}

export type RestoreResult =
  | { status: 'signed-in'; user: SessionUser }
  | { status: 'signed-out' }
  /** A stored session that could not be checked because the device is offline. */
  | { status: 'offline'; user: SessionUser };

/**
 * What to show on a cold start.
 *
 * A stored refresh token is not by itself proof of a live session — it may have been revoked —
 * so it is exchanged for an access token before the app claims to be signed in. When the exchange
 * cannot be made because there is no network, the cached user is returned with `offline` rather
 * than signing the person out: losing your session because you opened the app in a lift is not
 * a security improvement.
 */
export async function restoreSession(): Promise<RestoreResult> {
  const stored = await getStoredRefreshToken();
  const cookie = refreshCookieHeader(stored);
  if (!cookie) {
    return { status: 'signed-out' };
  }

  let response: Response;
  try {
    response = await fetch(`${mobileEnv.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', Cookie: cookie },
    });
  } catch {
    const cached = await getCachedUser();
    return cached ? { status: 'offline', user: cached } : { status: 'signed-out' };
  }

  if (!response.ok) {
    // Refused, not unreachable: the token is revoked, expired or reused. Sign out for real.
    await clearSession();
    return { status: 'signed-out' };
  }

  const payload = (await response.json()) as LoginResponse;
  await setSession(
    payload.accessToken,
    payload.user,
    refreshTokenFromSetCookie(response.headers.get('set-cookie')),
  );
  return { status: 'signed-in', user: payload.user };
}

/**
 * Signs out.
 *
 * The server is told first so the refresh-token family is revoked, but a failure there does not
 * stop the local clear: a person who taps sign out on a train must end up signed out.
 */
export async function logout(): Promise<void> {
  try {
    const cookie = refreshCookieHeader(await getStoredRefreshToken());
    await apiRequest('/auth/logout', {
      method: 'POST',
      skipAuth: false,
      ...(cookie ? { headers: { Cookie: cookie } } : {}),
    });
  } catch {
    // Already invalid, or unreachable. Either way the local session goes.
  } finally {
    await clearSession();
  }
}
