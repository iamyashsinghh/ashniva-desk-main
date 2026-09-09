import { createHmac } from 'node:crypto';

import {
  deliveryId,
  headerValue,
  safeEqual,
  verifyHmacSha256,
  verifySharedToken,
} from './webhook-signature';

const SECRET = 'a-webhook-secret-value';
const BODY = Buffer.from('{"action":"opened","number":7}', 'utf8');
const signatureFor = (body: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('verifyHmacSha256', () => {
  it('accepts a correctly signed body', () => {
    expect(verifyHmacSha256(BODY, signatureFor(BODY), SECRET)).toBe(true);
  });

  it('rejects a body that changed after signing', () => {
    const tampered = Buffer.from('{"action":"closed","number":7}', 'utf8');
    expect(verifyHmacSha256(tampered, signatureFor(BODY), SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyHmacSha256(BODY, signatureFor(BODY, 'someone-elses-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing or empty signature header', () => {
    expect(verifyHmacSha256(BODY, undefined, SECRET)).toBe(false);
    expect(verifyHmacSha256(BODY, '', SECRET)).toBe(false);
  });

  it('rejects when no secret is configured, rather than accepting everything', () => {
    expect(verifyHmacSha256(BODY, signatureFor(BODY), '')).toBe(false);
  });

  it('is sensitive to whitespace, which is why the raw body must be used', () => {
    // Re-serialising the parsed body would produce this and every genuine delivery would fail.
    const reserialised = Buffer.from('{"action": "opened", "number": 7}', 'utf8');
    expect(verifyHmacSha256(reserialised, signatureFor(BODY), SECRET)).toBe(false);
  });
});

describe('verifySharedToken', () => {
  it('accepts the configured token', () => {
    expect(verifySharedToken(SECRET, SECRET)).toBe(true);
  });

  it('rejects a wrong token, including a prefix of the right one', () => {
    expect(verifySharedToken('wrong', SECRET)).toBe(false);
    expect(verifySharedToken(SECRET.slice(0, -1), SECRET)).toBe(false);
  });

  it('rejects a missing token or a missing secret', () => {
    expect(verifySharedToken(undefined, SECRET)).toBe(false);
    expect(verifySharedToken(SECRET, '')).toBe(false);
  });
});

describe('safeEqual', () => {
  it('matches identical strings and rejects different ones', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
  });

  it('handles different lengths without throwing', () => {
    // timingSafeEqual itself throws on a length mismatch; hashing first avoids both the throw
    // and the timing signal that a length check would leak.
    expect(safeEqual('short', 'much longer value')).toBe(false);
  });
});

describe('deliveryId', () => {
  it('prefers the provider delivery id', () => {
    expect(deliveryId({ 'x-github-delivery': 'abc-123' }, 'digest')).toBe('abc-123');
    expect(deliveryId({ 'x-gitlab-event-uuid': 'uuid-9' }, 'digest')).toBe('uuid-9');
  });

  it('falls back to the body digest when the provider sends no id', () => {
    // A genuine redelivery is byte-identical, so it still collides on the unique index.
    expect(deliveryId({}, 'abc123')).toBe('digest:abc123');
    expect(deliveryId({ 'x-github-delivery': '  ' }, 'abc123')).toBe('digest:abc123');
  });

  it('takes the first value when a header repeats', () => {
    expect(deliveryId({ 'x-github-delivery': ['first', 'second'] }, 'digest')).toBe('first');
  });

  it('ignores a proxy request id, which is per request and not per event', () => {
    // nginx, Envoy, ALB and Cloudflare all mint an `x-request-id`. Preferring it over the body
    // digest gave a redelivery of the same event a fresh idempotency key, so it slipped past the
    // unique index and was processed twice — the opposite of what this function is for.
    expect(deliveryId({ 'x-request-id': 'proxy-1' }, 'abc123')).toBe('digest:abc123');
    expect(deliveryId({ 'x-request-id': 'proxy-2' }, 'abc123')).toBe('digest:abc123');
  });
});

describe('headerValue', () => {
  it('is case-insensitive and unwraps repeated headers', () => {
    expect(headerValue({ 'x-github-event': 'push' }, 'X-GitHub-Event')).toBe('push');
    expect(headerValue({ 'x-github-event': ['push', 'ping'] }, 'x-github-event')).toBe('push');
    expect(headerValue({}, 'x-missing')).toBeUndefined();
  });
});
