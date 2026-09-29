import type {
  AcceptInvitationRequest,
  InvitationPreview,
  SessionResponse,
  SessionUser,
} from '@ashniva/types';

import { mobileEnv } from '../../config/env';
import { ApiError, NetworkError, apiRequest, refreshSession } from '../../shared/api/client';
import {
  getAccessToken,
  getStoredRefreshToken,
  refreshCookieHeader,
  refreshTokenFromSetCookie,
  sessionGeneration,
  setSession,
} from './session-store';

/**
 * Account recovery, invitations, switching organization and changing a password.
 *
 * The three calls that answer with a session — accepting an invitation, switching organization and
 * signing back in after a password change — go through `fetch` directly for the same reason login
 * does: the refresh token only arrives as `Set-Cookie`, and the shared client deals in bodies.
 * Each is committed exactly the way sign-in commits, so the Keychain always holds the token the
 * server last issued.
 */

const UNREACHABLE = 'Could not reach the server. Check your connection and try again.';

export function requestPasswordReset(email: string): Promise<void> {
  return apiRequest<void>('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    skipAuth: true,
  });
}

export function resetPassword(token: string, password: string): Promise<void> {
  return apiRequest<void>('/auth/reset-password', {
    method: 'POST',
    body: { token, password },
    skipAuth: true,
  });
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return apiRequest<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`, {
    skipAuth: true,
  });
}

export async function acceptInvitation(input: AcceptInvitationRequest): Promise<SessionUser> {
  const response = await post('/auth/invitations/accept', input, {});
  return commit(response, 'Could not accept the invitation');
}

/**
 * Opens a session in another of the person's organizations.
 *
 * The refresh cookie goes with the request so the server can retire the old organization's token
 * family rather than leave it live beside the new one.
 */
export async function switchOrganization(organizationId: string): Promise<SessionUser> {
  // A sign-out during the request must win; otherwise the new session would revive it.
  const startedAt = sessionGeneration();
  let response = await post(
    '/auth/switch-organization',
    { organizationId },
    await sessionHeaders(),
  );
  if (response.status === 401 && (await refreshSession())) {
    response = await post('/auth/switch-organization', { organizationId }, await sessionHeaders());
  }
  return commit(response, 'Could not switch organization', startedAt);
}

/**
 * Changes the password, then signs this device straight back in with it.
 *
 * The API revokes every refresh token the person holds, this device's included. Without the second
 * step the phone would say "other devices have been signed out" and then sign itself out a few
 * minutes later, when the access token expired. Resolves with whether this device stayed signed in.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  user: SessionUser,
): Promise<boolean> {
  await apiRequest<void>('/users/me/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
  try {
    const startedAt = sessionGeneration();
    const response = await post(
      '/auth/login',
      { email: user.email, password: newPassword, organizationId: user.organization.id },
      {},
    );
    await commit(response, 'Could not sign in again', startedAt);
    return true;
  } catch {
    return false;
  }
}

async function post(
  path: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    return await fetch(`${mobileEnv.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch {
    throw new NetworkError(UNREACHABLE);
  }
}

async function sessionHeaders(): Promise<Record<string, string>> {
  const token = getAccessToken();
  const cookie = refreshCookieHeader(await getStoredRefreshToken());
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function commit(
  response: Response,
  fallback: string,
  expectedGeneration?: number,
): Promise<SessionUser> {
  if (!response.ok) {
    throw new ApiError(response.status, await readBody(response), fallback);
  }
  const payload = (await response.json()) as SessionResponse;
  const committed = await setSession(
    payload.accessToken,
    payload.user,
    refreshTokenFromSetCookie(response.headers.get('set-cookie')),
    expectedGeneration,
  );
  if (!committed) {
    throw new Error('You were signed out before this finished');
  }
  return payload.user;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}
