import { AI_GENERATION_STATUS, type AiGenerationStatus } from '@ashniva/types';

/**
 * How a failed provider call is classified.
 *
 * The distinction that matters is retryable versus not. Retrying a rate limit is correct and
 * costs a wait; retrying a rejected credential is wrong and burns the queue's attempts on
 * something that will never succeed. Provider calls here are HTTP, so HTTP conventions apply:
 * 5xx is the provider's problem and worth retrying, 4xx is ours and is not — except 408 and 429,
 * which are explicitly "try again".
 *
 * (Worth stating because the messaging module's SMTP classifier reads the other way round: for
 * SMTP, 5xx is permanent. The two look similar and mean opposite things, so they stay separate.)
 */

export interface ClassifiedAiFailure {
  status: AiGenerationStatus;
  retryable: boolean;
  /** A short, stable code for the run record. Never contains provider text. */
  code: string;
}

const NOT_RETRYABLE = (status: AiGenerationStatus, code: string): ClassifiedAiFailure => ({
  status,
  retryable: false,
  code,
});

const RETRYABLE = (status: AiGenerationStatus, code: string): ClassifiedAiFailure => ({
  status,
  retryable: true,
  code,
});

export function classifyHttpStatus(status: number): ClassifiedAiFailure {
  if (status === 429) {
    return RETRYABLE(AI_GENERATION_STATUS.RATE_LIMITED, 'rate-limited');
  }
  if (status === 408) {
    return RETRYABLE(AI_GENERATION_STATUS.TIMED_OUT, 'request-timeout');
  }
  if (status === 401 || status === 403) {
    // A credential the provider refuses will be refused again. Surface it instead of retrying.
    return NOT_RETRYABLE(AI_GENERATION_STATUS.FAILED, 'unauthorised');
  }
  if (status === 404) {
    return NOT_RETRYABLE(AI_GENERATION_STATUS.FAILED, 'endpoint-not-found');
  }
  if (status >= 500) {
    return RETRYABLE(AI_GENERATION_STATUS.FAILED, `provider-${status}`);
  }
  if (status >= 400) {
    return NOT_RETRYABLE(AI_GENERATION_STATUS.FAILED, `request-rejected-${status}`);
  }
  return NOT_RETRYABLE(AI_GENERATION_STATUS.FAILED, `unexpected-${status}`);
}

/** Node's network error codes, which arrive instead of a status when nothing was reached. */
const RETRYABLE_NETWORK = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Classifies whatever the adapter threw.
 *
 * Reads an HTTP status where there is one, an abort where the call was cut short, and a network
 * code otherwise. An error it cannot place is treated as not retryable: an unknown failure
 * repeated three times is three unknown failures.
 */
export function classifyAiError(error: unknown): ClassifiedAiFailure {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;

    if (record.name === 'AbortError' || record.name === 'TimeoutError') {
      return RETRYABLE(AI_GENERATION_STATUS.TIMED_OUT, 'timeout');
    }

    const status = numberOf(record.status) ?? numberOf(record.statusCode);
    if (status !== null) {
      return classifyHttpStatus(status);
    }

    const code = typeof record.code === 'string' ? record.code : null;
    if (code && RETRYABLE_NETWORK.has(code)) {
      return RETRYABLE(AI_GENERATION_STATUS.FAILED, `network-${code.toLowerCase()}`);
    }
    if (code) {
      return NOT_RETRYABLE(AI_GENERATION_STATUS.FAILED, `error-${code.toLowerCase()}`);
    }

    // A nested cause is where fetch puts the real network error.
    if (record.cause !== undefined && record.cause !== error) {
      return classifyAiError(record.cause);
    }
  }

  return NOT_RETRYABLE(AI_GENERATION_STATUS.FAILED, 'unknown');
}

/** An unusable response is its own outcome: the call worked, the answer did not. */
export function invalidResponseFailure(): ClassifiedAiFailure {
  return NOT_RETRYABLE(AI_GENERATION_STATUS.INVALID_RESPONSE, 'invalid-response');
}

function numberOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
