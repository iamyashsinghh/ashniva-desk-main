import {
  RETRY_POLICY,
  backoffDelayMs,
  hasAttemptsLeft,
  isRetryable,
  needsTokenRefresh,
  nextRetry,
} from './integration-retry';

describe('isRetryable', () => {
  it('retries provider-side failures', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryable({ status })).toBe(true);
    }
  });

  it('does not retry a request the provider will reject again', () => {
    // A revoked token or a malformed payload fails identically every time; retrying it would
    // hold the connection in an error loop and spend rate limit the working ones need.
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryable({ status })).toBe(false);
    }
  });

  it('retries the two 4xx that mean "later", not "never"', () => {
    expect(isRetryable({ status: 408 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('retries transport failures that never produced a response', () => {
    expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryable({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryable({ code: 'UND_ERR_CONNECT_TIMEOUT' })).toBe(true);
  });

  it('treats an unrecognised or missing error as permanent', () => {
    expect(isRetryable({ code: 'SOMETHING_ELSE' })).toBe(false);
    expect(isRetryable({})).toBe(false);
    expect(isRetryable(null)).toBe(false);
    expect(isRetryable(undefined)).toBe(false);
  });
});

describe('backoffDelayMs', () => {
  it('doubles from the base delay', () => {
    expect(backoffDelayMs(1)).toBe(5_000);
    expect(backoffDelayMs(2)).toBe(10_000);
    expect(backoffDelayMs(3)).toBe(20_000);
    expect(backoffDelayMs(4)).toBe(40_000);
    expect(backoffDelayMs(5)).toBe(80_000);
  });

  it('caps the wait so a long outage cannot push a job far into the future', () => {
    expect(backoffDelayMs(50)).toBe(RETRY_POLICY.maxDelayMs);
  });

  it('treats a zero or negative attempt as the first', () => {
    expect(backoffDelayMs(0)).toBe(5_000);
    expect(backoffDelayMs(-3)).toBe(5_000);
  });
});

describe('hasAttemptsLeft', () => {
  it('allows up to the configured maximum', () => {
    expect(hasAttemptsLeft(0)).toBe(true);
    expect(hasAttemptsLeft(RETRY_POLICY.maxAttempts - 1)).toBe(true);
    expect(hasAttemptsLeft(RETRY_POLICY.maxAttempts)).toBe(false);
  });
});

describe('nextRetry', () => {
  it('schedules a retry for a transient failure', () => {
    expect(nextRetry({ status: 503 }, 1)).toEqual({ retry: true, delayMs: 5_000 });
    expect(nextRetry({ status: 503 }, 3)).toEqual({ retry: true, delayMs: 20_000 });
  });

  it('stops immediately on a permanent failure, however many attempts remain', () => {
    expect(nextRetry({ status: 401 }, 1)).toEqual({ retry: false, reason: 'permanent' });
  });

  it('stops once the attempts are used up', () => {
    expect(nextRetry({ status: 503 }, RETRY_POLICY.maxAttempts)).toEqual({
      retry: false,
      reason: 'exhausted',
    });
  });
});

describe('needsTokenRefresh', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('refreshes a token inside the lead window', () => {
    expect(needsTokenRefresh(new Date('2026-09-06T12:05:00.000Z'), now)).toBe(true);
  });

  it('leaves a token that is still comfortably valid', () => {
    expect(needsTokenRefresh(new Date('2026-09-06T13:00:00.000Z'), now)).toBe(false);
  });

  it('refreshes a token that already expired', () => {
    expect(needsTokenRefresh(new Date('2026-09-06T11:00:00.000Z'), now)).toBe(true);
  });

  it('never refreshes a credential that does not expire', () => {
    expect(needsTokenRefresh(null, now)).toBe(false);
    expect(needsTokenRefresh(undefined, now)).toBe(false);
  });
});
