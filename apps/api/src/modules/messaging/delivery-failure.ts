/**
 * Deciding whether a failed send is worth trying again.
 *
 * This matters more than it looks. Retrying a permanent failure — an address that does not
 * exist, a credential the provider rejected — wastes attempts and, for a provider that counts
 * bad recipients against you, damages the sender's reputation. Not retrying a temporary one
 * loses a message that would have gone through a minute later.
 */

export type FailureKind = 'TRANSIENT' | 'PERMANENT' | 'THROTTLED';

export interface ClassifiedFailure {
  kind: FailureKind;
  /** Whether the sender should queue another attempt. */
  retryable: boolean;
  /** Suggested wait before the next attempt, when the provider named one. */
  retryAfterMs?: number;
}

/**
 * HTTP status codes: `5xx` is the server's problem and worth retrying, `4xx` is the request's
 * and is not, and 429 means "slow down" rather than "no".
 *
 * Note that SMTP reply codes mean close to the opposite — see `classifySmtpCode`. Passing an
 * SMTP code here would retry a rejected mailbox forever, so the two are separate functions
 * rather than one with a flag.
 */
export function classifyStatus(
  status: number | undefined,
  retryAfterMs?: number,
): ClassifiedFailure {
  if (status === undefined) {
    // No code at all is usually a socket or DNS problem: worth another go.
    return { kind: 'TRANSIENT', retryable: true };
  }
  if (status === 429) {
    return { kind: 'THROTTLED', retryable: true, retryAfterMs };
  }
  if (status >= 500) {
    return { kind: 'TRANSIENT', retryable: true, retryAfterMs };
  }
  if (status === 408 || status === 409) {
    return { kind: 'TRANSIENT', retryable: true, retryAfterMs };
  }
  if (status >= 400) {
    // 401, 403, 404, 422: the request itself is wrong. Repeating it changes nothing.
    return { kind: 'PERMANENT', retryable: false };
  }
  return { kind: 'TRANSIENT', retryable: true, retryAfterMs };
}

/**
 * SMTP reply codes, whose convention is the reverse of HTTP: `4xx` is a temporary failure the
 * sender should try again, `5xx` is a permanent rejection.
 *
 * Getting this backwards is the expensive mistake in a mail sender. Retrying a 550 "no such
 * mailbox" achieves nothing and, on a provider that counts rejected recipients against the
 * sender, steadily damages the domain's reputation.
 */
export function classifySmtpCode(code: number): ClassifiedFailure {
  if (code >= 500) {
    return { kind: 'PERMANENT', retryable: false };
  }
  if (code === 421 || code === 450 || code === 451 || code === 452) {
    // Explicitly "try later": the server is busy, greylisting, or out of space.
    return { kind: 'THROTTLED', retryable: true };
  }
  if (code >= 400) {
    return { kind: 'TRANSIENT', retryable: true };
  }
  return { kind: 'TRANSIENT', retryable: true };
}

/** Node socket errors that mean "the network was in the way", not "this will never work". */
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ESOCKET',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EDNS',
]);

/** Authentication and configuration failures: a retry sends the same wrong credential again. */
const PERMANENT_CODES = new Set(['EAUTH', 'EENVELOPE', 'ENOAUTH']);

/**
 * Classifies whatever a provider threw.
 *
 * Reads `responseCode` (nodemailer), `status`/`statusCode` (HTTP clients) and `code` (Node
 * sockets), in that order, and falls back to "transient" so an unrecognised failure is retried
 * rather than silently dropped — a message arriving late beats one that never arrives.
 */
export function classifyError(error: unknown): ClassifiedFailure {
  if (typeof error !== 'object' || error === null) {
    return { kind: 'TRANSIENT', retryable: true };
  }
  const candidate = error as {
    responseCode?: number;
    status?: number;
    statusCode?: number;
    code?: string;
    retryAfterMs?: number;
  };

  if (typeof candidate.code === 'string') {
    if (PERMANENT_CODES.has(candidate.code)) {
      return { kind: 'PERMANENT', retryable: false };
    }
    if (TRANSIENT_CODES.has(candidate.code)) {
      return { kind: 'TRANSIENT', retryable: true };
    }
  }

  // An SMTP reply code is read with SMTP rules, not HTTP ones.
  if (typeof candidate.responseCode === 'number') {
    return classifySmtpCode(candidate.responseCode);
  }
  return classifyStatus(candidate.status ?? candidate.statusCode, candidate.retryAfterMs);
}
