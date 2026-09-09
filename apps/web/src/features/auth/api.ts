import type {
  InvitationPreview,
  LoginRequest,
  ReauthResponse,
  SessionResponse,
  SessionUser,
} from '@ashniva/types';

import { apiRequest, refreshSession } from '../../shared/lib/api-client';
import { setAnonymous, setAuthenticated } from './session-store';

export async function login(input: LoginRequest): Promise<SessionUser> {
  const session = await apiRequest<SessionResponse>('/auth/login', {
    method: 'POST',
    body: input,
    skipAuth: true,
  });
  setAuthenticated(session.accessToken, session.user);
  return session.user;
}

/** Recovers the session from the refresh cookie on page load. */
export function restoreSession(): Promise<boolean> {
  return refreshSession();
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>('/auth/logout', { method: 'POST' });
  } finally {
    setAnonymous();
  }
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
