import { apiErrorResponseSchema, type ApiErrorResponse, type SessionUser } from '@ashniva/types';

import { mobileEnv } from '../../config/env';
import {
  clearSession,
  getAccessToken,
  getStoredRefreshToken,
  refreshCookieHeader,
  refreshTokenFromSetCookie,
  sessionGeneration,
  setSession,
} from '../../features/auth/session-store';

/**
 * The API client.
 *
 * Three things it does that a bare `fetch` does not: it attaches the bearer token, it retries once
 * through a refresh when the access token has expired, and it turns a non-2xx response into an
 * error carrying the API's own message so a screen can show something true rather than "request
 * failed".
 *
 * Tenant scoping is not done here and cannot be: the API derives the organization from the token
 * on every request. There is no organization id in any URL this client builds, so a modified app
 * cannot ask for another tenant's data.
 */

export class ApiError extends Error {
  readonly status: number;
  /** The structured body, when the response had the full standard shape. */
  readonly body: ApiErrorResponse | undefined;

  constructor(status: number, rawBody: unknown, fallback: string) {
    const parsed = apiErrorResponseSchema.safeParse(rawBody);
    // The strict parse is for `body`; the message is read loosely on purpose. A body that is
    // missing `timestamp` — a proxy's error page, an older deployment — still usually carries a
    // sentence worth showing, and "Request failed (409)" never is.
    super(parsed.success ? parsed.data.message : (looseMessage(rawBody) ?? fallback));
    this.name = 'ApiError';
    this.status = status;
    this.body = parsed.success ? parsed.data : undefined;
  }
}

/** A `message` string from an unrecognised error body, if there is one worth showing. */
function looseMessage(rawBody: unknown): string | null {
  if (typeof rawBody !== 'object' || rawBody === null) {
    return null;
  }
  const message = (rawBody as { message?: unknown }).message;
  return typeof message === 'string' && message.trim() ? message : null;
}

/** A request that never reached the API: no signal, a dropped connection, a timeout. */
export class NetworkError extends Error {
  constructor(message = 'Could not reach the server') {
    super(message);
    this.name = 'NetworkError';
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /**
   * The request body. A `FormData` is sent as multipart — that is the upload path, and it is the
   * same function rather than a second client so an upload gets the bearer token, the timeout and
   * the single-flight refresh like every other call.
   */
  body?: unknown;
  query?: QueryParams;
  headers?: Record<string, string>;
  /** Do not attach a token or attempt a refresh. For the auth endpoints themselves. */
  skipAuth?: boolean;
  signal?: AbortSignal;
}

export function buildQuery(params: QueryParams | undefined): string {
  if (!params) {
    return '';
  }
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

interface SessionPayload {
  accessToken: string;
  user: SessionUser;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the stored refresh token for a new access token.
 *
 * Concurrent 401s share one call: several screens loading at once would otherwise each present
 * the same refresh token, and the API rotates it — the second presentation would be a reuse of a
 * spent token, which is treated as theft and revokes the whole family.
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    // Read before the first await. If the user signs out while this is in flight, `setSession`
    // below refuses to commit rather than putting the session — and a fresh refresh token — back.
    const startedAt = sessionGeneration();
    try {
      const stored = await getStoredRefreshToken();
      const cookie = refreshCookieHeader(stored);
      if (!cookie) {
        await clearSession();
        return false;
      }

      const response = await fetch(`${mobileEnv.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { Accept: 'application/json', Cookie: cookie },
      });
      if (!response.ok) {
        await clearSession();
        return false;
      }

      const payload = (await response.json()) as SessionPayload;
      return await setSession(
        payload.accessToken,
        payload.user,
        refreshTokenFromSetCookie(response.headers.get('set-cookie')),
        startedAt,
      );
    } catch {
      // A refresh that could not reach the server is not proof the session is gone, but the app
      // has no usable access token either way. Clearing it sends the person to the sign-in
      // screen, which is honest about what has happened.
      await clearSession();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  if (response.status === 401 && !options.skipAuth) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return unwrap<T>(await send(path, options));
    }
  }

  return unwrap<T>(response);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), mobileEnv.requestTimeoutMs);
  // A caller's own abort (a screen unmounting) must still work alongside the timeout.
  options.signal?.addEventListener('abort', () => controller.abort());

  const token = options.skipAuth ? null : getAccessToken();
  // Multipart is the one body this client does not serialise or describe. React Native writes the
  // `Content-Type` itself, with the boundary it generated; setting our own would name a boundary
  // that is not in the body, and the API would see one unparseable part instead of the file.
  const isMultipart = options.body instanceof FormData;

  try {
    return await fetch(`${mobileEnv.apiBaseUrl}${path}${buildQuery(options.query)}`, {
      method: options.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined || isMultipart
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: bodyOf(options.body),
    });
  } catch (error) {
    throw new NetworkError(
      (error as { name?: string }).name === 'AbortError'
        ? 'The server took too long to answer'
        : 'Could not reach the server',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** What actually goes on the wire: multipart untouched, everything else as JSON. */
function bodyOf(body: unknown): RequestInit['body'] {
  if (body === undefined) {
    return undefined;
  }
  return body instanceof FormData ? body : JSON.stringify(body);
}

async function unwrap<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload, `Request failed (${response.status})`);
  }
  return payload as T;
}

/** A message worth showing a person, from whatever was thrown. */
export function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError || cause instanceof NetworkError) {
    return cause.message;
  }
  if (cause instanceof Error && cause.message) {
    return cause.message;
  }
  return 'Something went wrong';
}

/** True when the failure was the network rather than the API refusing something. */
export function isOffline(cause: unknown): boolean {
  return cause instanceof NetworkError;
}
