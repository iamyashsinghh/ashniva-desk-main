import { newClientMessageId } from './client-message-id';

/**
 * The idempotency key a send carries.
 *
 * The length assertion is the point of this file. `SendMessageDto.clientMessageId` is
 * `@MaxLength(64)`, and the shape this replaced could exceed it — about one send in fifty-seven
 * thousand — which the API answered with a 400 that no retry could get past, because the key is
 * held for the retry. A bound that is only true on average is not a bound, so both the platform's
 * generator and the fallback are measured here.
 */

/** The DTO's own ceiling. Stated as the number the API validates against, not as a variable. */
const MAX_CLIENT_MESSAGE_ID = 64;

/** Runs `work` with no Web Crypto in scope, which is what a phone actually has. */
function withoutWebCrypto<T>(work: () => T): T {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  try {
    return work();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, 'crypto', original);
    } else {
      Reflect.deleteProperty(globalThis, 'crypto');
    }
  }
}

describe('newClientMessageId', () => {
  it('is inside the length the API accepts, every time', () => {
    for (let attempt = 0; attempt < 2000; attempt += 1) {
      expect(newClientMessageId().length).toBeLessThanOrEqual(MAX_CLIENT_MESSAGE_ID);
    }
  });

  it('is a different id each time, so two sends are two messages', () => {
    expect(newClientMessageId()).not.toBe(newClientMessageId());
  });

  it('is a uuid rather than something merely short', () => {
    expect(newClientMessageId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  // React Native 0.86 has no `crypto` global at all, so this branch — not the one above — is what
  // runs on a phone. It has to satisfy the same three properties.
  describe('where the platform has no Web Crypto', () => {
    it('still answers a uuid inside the limit, and a different one each time', () => {
      withoutWebCrypto(() => {
        const ids = new Set<string>();
        for (let attempt = 0; attempt < 2000; attempt += 1) {
          const id = newClientMessageId();
          expect(id.length).toBeLessThanOrEqual(MAX_CLIENT_MESSAGE_ID);
          expect(id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
          );
          ids.add(id);
        }
        expect(ids.size).toBe(2000);
      });
    });
  });
});
