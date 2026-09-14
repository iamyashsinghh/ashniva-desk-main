import { apiErrorResponseSchema, type ApiErrorResponse } from '@ashniva/types';

import { webEnv } from '../../config/env';
import {
  getAccessToken,
  getSessionState,
  setAnonymous,
  setAuthenticated,
} from '../../features/auth/session-store';

/** Thrown for any non-2xx response; carries the API's structured error body. */
export class ApiError extends Error {
  readonly status: number;
  /** The structured API error, when the response had the standard shape. */
  readonly body: ApiErrorResponse | undefined;
  /** Whatever JSON the response carried, for endpoints that answer non-2xx with their own payload. */
  readonly rawBody: unknown;

  constructor(status: number, rawBody: unknown, fallbackMessage: string) {
    const parsed = apiErrorResponseSchema.safeParse(rawBody);
    const body = parsed.success ? parsed.data : undefined;
    super(body?.message ?? fallbackMessage);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.rawBody = rawBody;
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart upload; takes precedence over `body`. */
  formData?: FormData;
  query?: QueryParams;
  /** Extra headers, e.g. the short-lived re-authentication token for sensitive changes. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Do not attach the bearer token or try to refresh (the auth endpoints themselves). */
  skipAuth?: boolean;
}

export function buildQuery(params: QueryParams | undefined): string {
  if (!params) {
    return '';
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Rotates the refresh cookie and stores the new access token. Concurrent 401s share one
 * refresh call. Returns false (and clears the session) when the cookie is gone or revoked.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${webEnv.apiBaseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
        if (!response.ok) {
          // A login that finished while this refresh was in flight already has a session;
          // do not wipe it because the anonymous page-load refresh returned 401.
          if (getSessionState().status !== 'authenticated') {
            setAnonymous();
          }
          return false;
        }
        const session = (await response.json()) as {
          accessToken: string;
          user: Parameters<typeof setAuthenticated>[1];
        };
        setAuthenticated(session.accessToken, session.user);
        return true;
      } catch {
        if (getSessionState().status !== 'authenticated') {
          setAnonymous();
        }
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Fetch wrapper used by every feature's api.ts: bearer token from the in-memory session, JSON
 * or multipart bodies, query strings, and one transparent refresh-and-retry on 401.
 */
export async function apiRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const response = await send(path, options);
  if (response.status === 401 && !options.skipAuth && (await refreshSession())) {
    return parse<TResponse>(await send(path, options));
  }
  return parse<TResponse>(response);
}

/**
 * Same auth handling as apiRequest but returns the raw body, for downloads streamed through the
 * API. Plain <a href> links cannot carry the bearer token, so files are fetched and saved here.
 */
export async function apiBlob(path: string): Promise<Blob> {
  let response = await send(path, {});
  if (response.status === 401 && (await refreshSession())) {
    response = await send(path, {});
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      await readJsonBody(response),
      `Download failed with status ${response.status}`,
    );
  }
  return response.blob();
}

function send(path: string, options: RequestOptions): Promise<Response> {
  const token = options.skipAuth ? null : getAccessToken();
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined && !options.formData) {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(`${webEnv.apiBaseUrl}${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body:
      options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    credentials: 'include',
    signal: options.signal,
  });
}

async function parse<TResponse>(response: Response): Promise<TResponse> {
  if (!response.ok) {
    throw new ApiError(
      response.status,
      await readJsonBody(response),
      `Request failed with status ${response.status}`,
    );
  }
  if (response.status === 204) {
    return undefined as TResponse;
  }
  return (await response.json()) as TResponse;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Message to show a person for any error thrown by apiRequest. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.body?.details?.map((detail) => detail.message).filter(Boolean) ?? [];
    return details.length > 0 ? details.join(' ') : error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong';
}
