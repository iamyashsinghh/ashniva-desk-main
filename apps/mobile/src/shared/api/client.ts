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

/**
 * What a refresh came to.
 *
 * - `refreshed` — a new access token is in the session store.
 * - `refused` — the API said no (401/403) or there is no stored token. The session is gone.
 * - `unreachable` — no answer worth trusting: no network, a timeout, a 429 or a 5xx. The stored
 *   session is kept, because none of those says anything about whether it is still valid.
 */
export type RefreshOutcome =
  { kind: 'refreshed'; user: SessionUser } | { kind: 'refused' } | { kind: 'unreachable' };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/** A refusal is the API judging the token; anything else is the API not answering the question. */
const isRefusal = (status: number) => status === 401 || status === 403;

/**
 * Exchanges the stored refresh token for a new access token.
 *
 * Every exchange in the app goes through here — the cold-start restore as well as a 401 mid-use —
 * and concurrent callers share one call. The API rotates the token on each use and treats a second
 * presentation of a spent one as theft, revoking the whole family; two exchanges racing on launch
 * would sign the person out on every reload.
 */
export function exchangeRefreshToken(): Promise<RefreshOutcome> {
  refreshInFlight ??= (async (): Promise<RefreshOutcome> => {
    // Read before the first await. If the user signs out while this is in flight, `setSession`
    // below refuses to commit rather than putting the session — and a fresh refresh token — back.
    const startedAt = sessionGeneration();
    try {
      const cookie = refreshCookieHeader(await getStoredRefreshToken());
      if (!cookie) {
        await clearSession();
        return { kind: 'refused' };
      }

      let response: Response;
      try {
        response = await fetch(`${mobileEnv.apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { Accept: 'application/json', Cookie: cookie },
        });
      } catch {
        return { kind: 'unreachable' };
      }
      if (isRefusal(response.status)) {
        await clearSession();
        return { kind: 'refused' };
      }
      if (!response.ok) {
        return { kind: 'unreachable' };
      }

      const payload = (await response.json()) as SessionPayload;
      const committed = await setSession(
        payload.accessToken,
        payload.user,
        refreshTokenFromSetCookie(response.headers.get('set-cookie')),
        startedAt,
      );
      return committed ? { kind: 'refreshed', user: payload.user } : { kind: 'refused' };
    } catch {
      // An unreadable body from a 2xx — a proxy's page, a truncated reply. Not a verdict.
      return { kind: 'unreachable' };
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** True when a fresh access token is now in the session store. */
export async function refreshSession(): Promise<boolean> {
  return (await exchangeRefreshToken()).kind === 'refreshed';
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);

  if (response.status === 401 && !options.skipAuth) {
    const outcome = await exchangeRefreshToken();
    if (outcome.kind === 'refreshed') {
      return unwrap<T>(await send(path, options));
    }
    if (outcome.kind === 'unreachable') {
      // The screen shows "could not reach the server" and offers a retry, rather than a 401
      // that reads like the person lost access.
      throw new NetworkError();
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
