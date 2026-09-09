import { SUPPORT_CALLBACK_HEADERS, type SupportCallbackEvent } from '@ashniva/types';

import { signHmacSha256 } from '../../common/crypto/webhook-signature';

/** The headers one delivery carries, ready to hand to the transport. */
export interface SignedCallback {
  body: string;
  headers: Record<string, string>;
}

/**
 * Signs one callback.
 *
 * **Over the exact bytes that go on the wire.** `body` is serialized once, here, and the same
 * string is both signed and sent. Signing a parsed object and re-serialising it for the request
 * would reorder keys and change whitespace, and every genuine delivery would fail verification —
 * which is the same rule `webhook-signature.ts` states for the inbound direction, in the other
 * direction.
 *
 * **The timestamp is inside the signature.** The signed material is `<timestamp>.<body>`, not the
 * body alone. A signature over the body alone is replayable forever: anybody who captures one
 * delivery can post it again, and the receiver has no way to tell. Binding the timestamp means a
 * receiver that refuses anything older than its replay window is genuinely protected, because an
 * attacker cannot move the timestamp without invalidating the signature.
 *
 * The HMAC itself comes from `common/crypto/webhook-signature.ts` — the same function that
 * verifies GitHub, GitLab and WhatsApp deliveries — so there is one implementation of `sha256=…`
 * in the product rather than one per direction.
 */
export function signCallback(input: {
  payload: unknown;
  secret: string;
  deliveryId: string;
  event: SupportCallbackEvent;
  now?: Date;
}): SignedCallback {
  const body = JSON.stringify(input.payload);
  const timestamp = Math.floor((input.now ?? new Date()).getTime() / 1000).toString();
  return {
    body,
    headers: {
      'content-type': 'application/json',
      [SUPPORT_CALLBACK_HEADERS.DELIVERY.toLowerCase()]: input.deliveryId,
      [SUPPORT_CALLBACK_HEADERS.EVENT.toLowerCase()]: input.event,
      [SUPPORT_CALLBACK_HEADERS.TIMESTAMP.toLowerCase()]: timestamp,
      [SUPPORT_CALLBACK_HEADERS.SIGNATURE.toLowerCase()]: signHmacSha256(
        `${timestamp}.${body}`,
        input.secret,
      ),
    },
  };
}
