import { classifyAiError, classifyHttpStatus, invalidResponseFailure } from './ai-failure';

describe('classifyHttpStatus', () => {
  it('retries a rate limit', () => {
    expect(classifyHttpStatus(429)).toMatchObject({
      status: 'RATE_LIMITED',
      retryable: true,
      code: 'rate-limited',
    });
  });

  it('retries the provider’s own failures', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(classifyHttpStatus(status).retryable).toBe(true);
    }
  });

  it('does not retry a rejected credential', () => {
    // A credential the provider refuses will be refused again. Three attempts is three calls
    // that cannot succeed, and each one is billed.
    expect(classifyHttpStatus(401)).toMatchObject({ retryable: false, code: 'unauthorised' });
    expect(classifyHttpStatus(403)).toMatchObject({ retryable: false, code: 'unauthorised' });
  });

  it('does not retry a wrong endpoint', () => {
    expect(classifyHttpStatus(404)).toMatchObject({ retryable: false });
  });

  it('does not retry a rejected request', () => {
    expect(classifyHttpStatus(400)).toMatchObject({ retryable: false });
    expect(classifyHttpStatus(422)).toMatchObject({ retryable: false });
  });

  it('retries a request timeout', () => {
    expect(classifyHttpStatus(408)).toMatchObject({ status: 'TIMED_OUT', retryable: true });
  });

  it('reads the other way round from SMTP, deliberately', () => {
    // The messaging module treats SMTP 5xx as permanent. HTTP 5xx is the opposite. The two look
    // alike, which is exactly why they are classified in separate files.
    expect(classifyHttpStatus(550).retryable).toBe(true);
  });
});

describe('classifyAiError', () => {
  it('treats an abort as a retryable timeout', () => {
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(classifyAiError(error)).toMatchObject({ status: 'TIMED_OUT', retryable: true });
  });

  it('reads a status off the error', () => {
    expect(classifyAiError({ status: 429 })).toMatchObject({ status: 'RATE_LIMITED' });
    expect(classifyAiError({ statusCode: 401 })).toMatchObject({ retryable: false });
  });

  it('retries a network drop', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET']) {
      expect(classifyAiError({ code }).retryable).toBe(true);
    }
  });

  it('does not retry an unrecognised error code', () => {
    expect(classifyAiError({ code: 'ERR_INVALID_ARG_TYPE' })).toMatchObject({ retryable: false });
  });

  it('follows a nested cause, which is where fetch puts the real failure', () => {
    const error = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    expect(classifyAiError(error)).toMatchObject({ retryable: true });
  });

  it('does not loop on an error that is its own cause', () => {
    const error: Record<string, unknown> = { message: 'weird' };
    error.cause = error;
    expect(classifyAiError(error)).toMatchObject({ code: 'unknown', retryable: false });
  });

  it('treats an unplaceable error as not retryable', () => {
    // An unknown failure repeated three times is three unknown failures.
    expect(classifyAiError('something went wrong')).toMatchObject({
      retryable: false,
      code: 'unknown',
    });
    expect(classifyAiError(null)).toMatchObject({ retryable: false });
  });

  it('puts nothing from the error into the code', () => {
    const error = { code: 'ECONNRESET', message: 'token abc123 was rejected' };
    expect(classifyAiError(error).code).not.toContain('abc123');
  });
});

describe('invalidResponseFailure', () => {
  it('is its own outcome: the call worked, the answer did not', () => {
    expect(invalidResponseFailure()).toMatchObject({
      status: 'INVALID_RESPONSE',
      retryable: false,
    });
  });
});
