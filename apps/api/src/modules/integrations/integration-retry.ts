/**
 * When a provider call is worth trying again, and how long to wait.
 *
 * The distinction that matters: a 5xx or a timeout is the provider having a bad moment, so retry;
 * a 4xx is us sending something it will reject just as firmly next time, so do not. Retrying a
 * revoked token forever would lock the connection into a permanent error loop and burn rate limit
 * that the working integrations need. 429 is the exception — it means "later", not "never".
 */

/** Errors carrying an HTTP status from a provider call. */
export interface ProviderError {
  status?: number;
  code?: string;
}

export const RETRY_POLICY = {
  maxAttempts: 5,
  baseDelayMs: 5_000,
  factor: 2,
  maxDelayMs: 120_000,
} as const;

/** Transport-level failures: no HTTP response came back at all. */
const RETRYABLE_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ERR_SOCKET_CONNECTION_TIMEOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
]);

export function isRetryable(error: ProviderError | null | undefined): boolean {
  if (!error) {
    return false;
  }
  if (error.status !== undefined) {
    // 408 Request Timeout and 429 Too Many Requests are worth another go; other 4xx are not.
    if (error.status === 408 || error.status === 429) {
      return true;
    }
    if (error.status >= 400 && error.status < 500) {
      return false;
    }
    return error.status >= 500;
  }
  return error.code !== undefined && RETRYABLE_CODES.has(error.code);
}

/**
 * Delay before attempt number `attempt` (1 = the first retry), capped so a long outage does not
 * push a job days into the future.
 */
export function backoffDelayMs(attempt: number, policy = RETRY_POLICY): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  const raw = policy.baseDelayMs * policy.factor ** (safeAttempt - 1);
  return Math.min(raw, policy.maxDelayMs);
}

/** Whether another attempt is allowed at all, independent of the error. */
export function hasAttemptsLeft(attemptsSoFar: number, policy = RETRY_POLICY): boolean {
  return attemptsSoFar < policy.maxAttempts;
}

/**
 * The single decision a queue processor needs: retry after N ms, or stop.
 * `attemptsSoFar` counts attempts already made, including the one that just failed.
 */
export function nextRetry(
  error: ProviderError | null | undefined,
  attemptsSoFar: number,
  policy = RETRY_POLICY,
): { retry: true; delayMs: number } | { retry: false; reason: 'permanent' | 'exhausted' } {
  if (!isRetryable(error)) {
    return { retry: false, reason: 'permanent' };
  }
  if (!hasAttemptsLeft(attemptsSoFar, policy)) {
    return { retry: false, reason: 'exhausted' };
  }
  return { retry: true, delayMs: backoffDelayMs(attemptsSoFar, policy) };
}

/**
 * BullMQ job options matching this policy, so queue-level retries and our own accounting agree.
 */
export function bullRetryOptions(policy = RETRY_POLICY) {
  return {
    attempts: policy.maxAttempts,
    backoff: { type: 'exponential' as const, delay: policy.baseDelayMs },
    removeOnComplete: { age: 3600, count: 500 },
    removeOnFail: { age: 86_400 },
  };
}

/** A token due to expire within this window is refreshed before the next use. */
export const TOKEN_REFRESH_LEAD_MS = 10 * 60 * 1000;

export function needsTokenRefresh(expiresAt: Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }
  return expiresAt.getTime() - now.getTime() <= TOKEN_REFRESH_LEAD_MS;
}
