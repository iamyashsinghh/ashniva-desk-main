import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signature verification, shared by every provider that signs its deliveries —
 * GitHub, GitLab and the Meta WhatsApp Cloud API.
 *
 * Two rules hold everywhere in this file:
 *
 *  1. Every comparison is constant-time. A `===` on a signature leaks, through timing, how much
 *     of a guess was correct, which turns forging a signature into a per-byte search.
 *  2. Verification runs on the **raw request body**, byte for byte. `JSON.parse` followed by
 *     `JSON.stringify` reorders keys and changes whitespace, so a re-serialised body produces a
 *     different HMAC and every genuine delivery would be rejected.
 */

/** Compares two strings without revealing where they first differ. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself be a timing signal; hashing
  // both sides to a fixed width first keeps the comparison constant-time for any input.
  const leftHash = createHmac('sha256', 'length-guard').update(left).digest();
  const rightHash = createHmac('sha256', 'length-guard').update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

/**
 * The one HMAC in the product, in the one format every side of it uses: `sha256=<hex>`.
 *
 * Both directions go through this. Inbound, GitHub, GitLab and the Meta WhatsApp Cloud API sign
 * what they send us; outbound, Desk signs what it sends a customer's callback endpoint. Two
 * implementations of the same scheme would be two places for the digest encoding or the header
 * format to drift, and a drifted signature is indistinguishable from a forged one.
 */
export function signHmacSha256(payload: Buffer | string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

/**
 * GitHub signs the raw body with HMAC-SHA256 and sends `sha256=<hex>` in X-Hub-Signature-256.
 * The same scheme is used by the Meta WhatsApp Cloud API.
 */
export function verifyHmacSha256(
  rawBody: Buffer,
  headerValue: string | undefined,
  secret: string,
): boolean {
  if (!headerValue || !secret) {
    return false;
  }
  return safeEqual(headerValue, signHmacSha256(rawBody, secret));
}

/**
 * GitLab sends the shared secret verbatim in X-Gitlab-Token — there is no HMAC to compute, so the
 * whole protection is the constant-time comparison.
 */
export function verifySharedToken(headerValue: string | undefined, secret: string): boolean {
  if (!headerValue || !secret) {
    return false;
  }
  return safeEqual(headerValue, secret);
}

/**
 * The provider's own delivery id, used as the idempotency key.
 *
 * When a provider sends no id, the digest of the body is used instead: a genuine redelivery of
 * the same event is byte-identical, so it collides on the unique index exactly as a repeated
 * delivery id would. Two genuinely distinct events are vanishingly unlikely to be byte-identical.
 *
 * Only headers a provider sets per *event* count. `x-request-id` was here and had to go: nginx,
 * Envoy, ALB and Cloudflare all mint one per HTTP request, so a redelivery of the same event
 * arrives with a fresh value and slips past the unique index — which is the opposite of what this
 * function is for. A proxy header must never be preferred over the body digest.
 */
export function deliveryId(
  headers: Record<string, string | string[] | undefined>,
  payloadDigest: string,
): string {
  const candidates = ['x-github-delivery', 'x-gitlab-event-uuid'];
  for (const name of candidates) {
    const value = headers[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (single && single.trim().length > 0) {
      return single.trim();
    }
  }
  return `digest:${payloadDigest}`;
}

/** Header lookup that tolerates the array form Node uses for repeated headers. */
export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
