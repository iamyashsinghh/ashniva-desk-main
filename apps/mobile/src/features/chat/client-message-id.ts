/**
 * The idempotency key a send carries.
 *
 * `SendMessageDto.clientMessageId` is `@MaxLength(64)`, and the shape this replaced —
 * `<conversation uuid>:<epoch ms>:<Math.random().toString(36).slice(2)>` — was 51 characters plus
 * a suffix whose length is not fixed: `toString(36)` sometimes yields 14 or 15 characters, which
 * pushed the id to 65 and the send to a 400. Rare, and worse than rare — the key is held in a ref
 * so that a retry re-presents it, so the one draft that minted an over-long id could never be sent
 * at all until it was retyped.
 *
 * A uuid removes the whole class of problem: 36 characters, always, with no arithmetic to get
 * wrong and no timestamp whose width depends on the epoch. It is what the web composer sends.
 *
 * **Why this is not simply `crypto.randomUUID()`.** React Native 0.86 ships no Web Crypto at all —
 * there is no `crypto` global on Hermes, so calling it directly would throw on a phone while
 * passing in jest, where Node provides one. So the global is used when it is there (a newer React
 * Native, a browser, the test runner) and a v4 is assembled from `Math.random` when it is not.
 *
 * That fallback is honest about what it is: `Math.random` is not a cryptographic source. It does
 * not need to be. This value is an idempotency key — the server stores it against the sender and
 * the conversation and uses it to recognise a retry — not a secret, not a capability and not
 * something anybody else can present. What it has to be is *different from the last one*, and 122
 * random bits drawn a nibble at a time is far beyond what one person's drafts can collide in.
 */
export function newClientMessageId(): string {
  // Narrowed by hand rather than trusted: React Native's own type definitions declare no `crypto`
  // on `globalThis`, which is the honest position — on a phone there is not one.
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  return uuidFromMathRandom();
}

/** The canonical 8-4-4-4-12 form, with the version and variant bits RFC 4122 asks for. */
function uuidFromMathRandom(): string {
  let out = '';
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) {
      out += '-';
    } else if (index === 14) {
      out += '4';
    } else if (index === 19) {
      // The variant nibble: one of 8, 9, a, b.
      out += ((Math.random() * 4) | 8).toString(16);
    } else {
      out += ((Math.random() * 16) | 0).toString(16);
    }
  }
  return out;
}
