import type {
  InvitationPreview,
  LoginRequest,
  ReauthResponse,
  SessionResponse,
  SessionUser,
} from '@ashniva/types';

import { apiRequest, refreshSessionOutcome } from '../../shared/lib/api-client';
import { getSessionState, setAnonymous, setAuthenticated, setSessionUser } from './session-store';

export async function login(input: LoginRequest): Promise<SessionUser> {
  const session = await apiRequest<SessionResponse>('/auth/login', {
    method: 'POST',
    body: input,
    skipAuth: true,
  });
  setAuthenticated(session.accessToken, session.user);
  return session.user;
}

const RESTORE_RETRY_MAX_MS = 15_000;

/**
 * Recovers the session from the refresh cookie on page load.
 *
 * While the API cannot be reached — no network, or the server restarting — the page keeps its
 * loading state and tries again, backing off to every fifteen seconds, rather than showing the
 * sign-in form to somebody whose session is perfectly good. Only a refused cookie ends in the
 * sign-in form.
 */
export async function restoreSession(): Promise<boolean> {
  for (let attempt = 0; ; attempt += 1) {
    const outcome = await refreshSessionOutcome();
    if (outcome !== 'unreachable') {
      return outcome === 'refreshed';
    }
    if (getSessionState().status === 'authenticated') {
      return true;
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(1000 * 2 ** attempt, RESTORE_RETRY_MAX_MS)),
    );
  }
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' });
  } finally {
    setAnonymous();
  }
}

/**
 * Re-reads the signed-in person from `GET /auth/me` into the session, so everything drawing them —
 * the header first of all — shows what the server now holds. The token is left as it is.
 */
export async function refreshSessionUser(): Promise<SessionUser> {
  const user = await apiRequest<SessionUser>('/auth/me');
  setSessionUser(user);
  return user;
}

export async function switchOrganization(organizationId: string): Promise<SessionUser> {
  const session = await apiRequest<SessionResponse>('/auth/switch-organization', {
    method: 'POST',
    body: { organizationId },
  });
  setAuthenticated(session.accessToken, session.user);
  return session.user;
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiRequest<void>('/users/me/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

/** Short-lived token proving the person just re-entered their password. */
export async function reauthenticate(password: string): Promise<string> {
  const response = await apiRequest<ReauthResponse>('/auth/reauth', {
    method: 'POST',
    body: { password },
  });
  return response.reauthToken;
}

export function previewInvitation(token: string): Promise<InvitationPreview> {
  return apiRequest<InvitationPreview>(`/auth/invitations/${encodeURIComponent(token)}`, {
    skipAuth: true,
  });
}

/** Accepting signs the person in straight away. */
export async function acceptInvitation(input: {
  token: string;
  name?: string;
  password: string;
}): Promise<SessionUser> {
  const session = await apiRequest<SessionResponse>('/auth/invitations/accept', {
    method: 'POST',
    body: input,
    skipAuth: true,
  });
  setAuthenticated(session.accessToken, session.user);
  return session.user;
}

export function forgotPassword(email: string): Promise<void> {
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
