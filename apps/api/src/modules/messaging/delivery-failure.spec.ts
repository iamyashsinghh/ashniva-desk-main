import { classifyError, classifySmtpCode, classifyStatus } from './delivery-failure';

describe('classifySmtpCode', () => {
  it('treats 5xx as a permanent rejection, the reverse of HTTP', () => {
    // 550 is "no such mailbox". Retrying it forever damages the sending domain's reputation.
    expect(classifySmtpCode(550)).toMatchObject({ kind: 'PERMANENT', retryable: false });
    expect(classifySmtpCode(553)).toMatchObject({ retryable: false });
    expect(classifySmtpCode(535)).toMatchObject({ retryable: false });
  });

  it('treats 4xx as temporary, so greylisting and busy servers are retried', () => {
    expect(classifySmtpCode(421)).toMatchObject({ retryable: true });
    expect(classifySmtpCode(450)).toMatchObject({ retryable: true });
    expect(classifySmtpCode(451)).toMatchObject({ kind: 'THROTTLED', retryable: true });
    expect(classifySmtpCode(452)).toMatchObject({ retryable: true });
  });
});

describe('classifyStatus', () => {
  it('treats 5xx as worth retrying', () => {
    expect(classifyStatus(500)).toMatchObject({ kind: 'TRANSIENT', retryable: true });
    expect(classifyStatus(503)).toMatchObject({ retryable: true });
  });

  it('treats 4xx as permanent, so a rejected message is not sent again', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(classifyStatus(status)).toMatchObject({ kind: 'PERMANENT', retryable: false });
    }
  });

  it('separates throttling from rejection', () => {
    // 429 is "not now", not "no" — retrying is right, and the provider's wait is honoured.
    expect(classifyStatus(429, 30_000)).toEqual({
      kind: 'THROTTLED',
      retryable: true,
      retryAfterMs: 30_000,
    });
  });

  it('retries when the provider gave no status at all', () => {
    expect(classifyStatus(undefined)).toMatchObject({ retryable: true });
  });
});

describe('classifyError', () => {
  it('reads an SMTP response code with SMTP rules, not HTTP ones', () => {
    expect(classifyError({ responseCode: 550 })).toMatchObject({ retryable: false });
    expect(classifyError({ responseCode: 451 })).toMatchObject({ retryable: true });
  });

  it('does not confuse an SMTP 5xx with an HTTP 5xx', () => {
    // The same number means opposite things depending on which field carried it.
    expect(classifyError({ responseCode: 500 })).toMatchObject({ retryable: false });
    expect(classifyError({ status: 500 })).toMatchObject({ retryable: true });
  });

  it('does not retry an authentication failure', () => {
    // Sending the same wrong password again would only lock the account out faster.
    expect(classifyError({ code: 'EAUTH' })).toMatchObject({
      kind: 'PERMANENT',
      retryable: false,
    });
  });

  it('retries a socket problem', () => {
    for (const code of ['ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EAI_AGAIN']) {
      expect(classifyError({ code })).toMatchObject({ kind: 'TRANSIENT', retryable: true });
    }
  });

  it('prefers the error code over the status when both are present', () => {
    expect(classifyError({ code: 'EAUTH', status: 503 })).toMatchObject({ retryable: false });
  });

  it('retries something it does not recognise', () => {
    // A message arriving late beats one dropped because the failure was unfamiliar.
    expect(classifyError(new Error('something odd'))).toMatchObject({ retryable: true });
    expect(classifyError(null)).toMatchObject({ retryable: true });
    expect(classifyError('a string')).toMatchObject({ retryable: true });
  });

  it('reads an HTTP client’s status field', () => {
    expect(classifyError({ status: 429, retryAfterMs: 5_000 })).toEqual({
      kind: 'THROTTLED',
      retryable: true,
      retryAfterMs: 5_000,
    });
    expect(classifyError({ statusCode: 404 })).toMatchObject({ retryable: false });
  });
});
