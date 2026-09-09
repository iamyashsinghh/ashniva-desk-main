import { REFRESH_TOKEN_COOKIE } from '@ashniva/types';
import type { CookieOptions, Request, Response } from 'express';

import { API_DEFAULT_VERSION, API_GLOBAL_PREFIX } from '../../app.setup';

/** The cookie is only ever sent to the auth endpoints, never with ordinary API calls. */
export const REFRESH_COOKIE_PATH = `/${API_GLOBAL_PREFIX}/v${API_DEFAULT_VERSION}/auth`;

/**
 * `req.secure`, and nothing else.
 *
 * This used to read `x-forwarded-proto` itself, which meant any client could assert the scheme of
 * its own request by sending a header. Express already answers this question properly: `secure`
 * is true for a direct TLS connection, and true for a forwarded one only when `TRUST_PROXY` says
 * the proxy in front is one we believe. Deciding it here duplicated that logic and got it wrong
 * in both directions — an untrusted header was believed, and behind a correctly configured proxy
 * the answer was right by accident rather than by configuration.
 */
function isHttps(request: Request): boolean {
  return request.secure;
}

/**
 * httpOnly + SameSite=strict keeps the refresh token away from scripts and cross-site requests.
 * `secure` follows the actual scheme of the request so the local Docker preview (plain http on
 * localhost, which Safari does not treat as a secure context) still works, while any TLS
 * deployment gets a Secure cookie.
 */
export function refreshCookieOptions(request: Request, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: isHttps(request),
    path: REFRESH_COOKIE_PATH,
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}

export function setRefreshCookie(
  request: Request,
  response: Response,
  token: string,
  expiresAt: Date,
): void {
  response.cookie(
    REFRESH_TOKEN_COOKIE,
    token,
    refreshCookieOptions(request, Math.max(0, expiresAt.getTime() - Date.now())),
  );
}

export function clearRefreshCookie(request: Request, response: Response): void {
  response.clearCookie(REFRESH_TOKEN_COOKIE, refreshCookieOptions(request));
}

export function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, unknown> }).cookies;
  const value = cookies?.[REFRESH_TOKEN_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
