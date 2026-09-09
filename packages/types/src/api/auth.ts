import { z } from 'zod';

import type { PermissionKey } from '../permissions/permission-keys';
import type { RoleKey } from '../roles/role-keys';

/**
 * Session contract between the web/mobile apps and POST /auth/login, /auth/refresh, /auth/me.
 *
 * The access token is returned in the body and kept in memory by the client. The refresh token
 * is NEVER returned in the body: it travels in an httpOnly, SameSite=strict cookie scoped to the
 * /api/v1/auth path, so scripts cannot read it and it is not sent with ordinary API requests.
 */
export const loginRequestSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
  /** Optional: sign in to a specific organization when the user belongs to several. */
  organizationId: z.string().uuid().optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  isServiceProvider: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  title: string | null;
  /** Behaviour template: a custom role reports the system role it was cloned from. */
  roleKey: RoleKey;
  roleId: string;
  roleName: string;
  isCustomRole: boolean;
  permissions: readonly PermissionKey[];
  /** Admin → Users → "Show Development section" for seniors who no longer code. */
  showDevelopmentSection: boolean;
  organization: SessionOrganization;
  /** Every organization the user can switch to (memberships). */
  organizations: SessionOrganization[];
}

export interface SessionResponse {
  accessToken: string;
  accessTokenExpiresInSeconds: number;
  user: SessionUser;
}

/** Name of the httpOnly cookie carrying the refresh token. */
export const REFRESH_TOKEN_COOKIE = 'ashniva_refresh';

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().min(2).max(120).optional(),
  password: z.string().min(12).max(200),
});

export type AcceptInvitationRequest = z.infer<typeof acceptInvitationSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().email().max(254) });

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12).max(200),
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

/** What the invitation page shows before the person chooses a password. */
export interface InvitationPreview {
  email: string;
  name: string;
  organizationName: string;
  roleName: string;
  expiresAt: string;
}

/**
 * Sensitive changes (permissions, role assignments, hour adjustments) require a fresh password
 * check. POST /auth/reauth returns this short-lived token, sent back as X-Reauth-Token.
 */
export interface ReauthResponse {
  reauthToken: string;
  expiresInSeconds: number;
}

export const REAUTH_HEADER = 'x-reauth-token';
