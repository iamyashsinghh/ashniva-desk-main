import { healthResponseSchema, type HealthResponse } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { mobileEnv } from '../../../config/env';
import { ApiError, NetworkError } from '../../../shared/api/client';
import { shouldRetry } from '../../../shared/api/queries';

export const HEALTH_KEY = ['system', 'health'] as const;

/**
 * `GET /health`, keeping the body of a 503.
 *
 * The endpoint answers 503 *with the same body* when a component is down, and that body — which
 * component, how slow, why — is the whole point of the screen. `apiRequest` turns a 503 into an
 * `ApiError` that keeps only a standard error body, so this public, unauthenticated route is read
 * directly, with the same timeout, rather than losing the one answer that matters most.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), mobileEnv.requestTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${mobileEnv.apiBaseUrl}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = JSON.parse(await response.text());
  } catch {
    body = null;
  }
  const parsed = healthResponseSchema.safeParse(body);
  if ((response.ok || response.status === 503) && parsed.success) {
    return parsed.data;
  }
  throw new ApiError(response.status, body, `The status check failed (${response.status})`);
}

/** Re-checked every 30 seconds while the screen is open, as on the web. */
export function useHealth() {
  return useQuery({
    queryKey: HEALTH_KEY,
    queryFn: fetchHealth,
    retry: shouldRetry,
    refetchInterval: 30_000,
  });
}
