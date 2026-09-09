import { createHmac } from 'node:crypto';

import { SUPPORT_CALLBACK_EVENT, SUPPORT_CALLBACK_HEADERS } from '@ashniva/types';

import { nextRetry } from '../integrations/integration-retry';
import { signCallback } from './callback-signature';
import { subscribes } from './callback-sender.service';

const SECRET = 'shhh-signing-secret';

function sign(payload: unknown, now: Date) {
  return signCallback({
    payload,
    secret: SECRET,
    deliveryId: 'delivery-1',
    event: SUPPORT_CALLBACK_EVENT.TICKET_RESOLVED,
    now,
  });
}

describe('callback signatures', () => {
  const now = new Date('2026-09-17T09:00:00.000Z');
  const timestamp = String(Math.floor(now.getTime() / 1000));

  it('signs the exact bytes it sends, with the timestamp bound in', () => {
    const payload = { deliveryId: 'delivery-1', ticket: { key: 'T-1' } };
    const signed = sign(payload, now);

    const expected = createHmac('sha256', SECRET)
      .update(`${timestamp}.${signed.body}`)
      .digest('hex');

    expect(signed.headers[SUPPORT_CALLBACK_HEADERS.SIGNATURE.toLowerCase()]).toBe(
      `sha256=${expected}`,
    );
    expect(signed.headers[SUPPORT_CALLBACK_HEADERS.TIMESTAMP.toLowerCase()]).toBe(timestamp);
    expect(signed.headers[SUPPORT_CALLBACK_HEADERS.DELIVERY.toLowerCase()]).toBe('delivery-1');
    expect(signed.headers[SUPPORT_CALLBACK_HEADERS.EVENT.toLowerCase()]).toBe('ticket.resolved');
  });

  /**
   * The rule the receiver documentation states, verified from this side: a receiver that
   * re-serialises the body computes a different HMAC. Sending the string that was signed is what
   * makes the recipe in the README work.
   */
  it('is invalidated by re-serialising the body', () => {
    const signed = sign({ b: 1, a: 2 }, now);
    const reserialized = JSON.stringify(JSON.parse(signed.body), Object.keys({ a: 0, b: 0 }));
    const overReserialized = `sha256=${createHmac('sha256', SECRET).update(`${timestamp}.${reserialized}`).digest('hex')}`;

    expect(signed.headers[SUPPORT_CALLBACK_HEADERS.SIGNATURE.toLowerCase()]).not.toBe(
      overReserialized,
    );
  });

  it('changes when the timestamp changes, so a replay cannot be re-dated', () => {
    const first = sign({ a: 1 }, now);
    const later = sign({ a: 1 }, new Date(now.getTime() + 60_000));
    expect(first.headers[SUPPORT_CALLBACK_HEADERS.SIGNATURE.toLowerCase()]).not.toBe(
      later.headers[SUPPORT_CALLBACK_HEADERS.SIGNATURE.toLowerCase()],
    );
  });
});

describe('retry classification', () => {
  /** The same distinction `integration-retry.ts` draws for a provider call, applied to a receiver. */
  it('retries a receiver having a bad moment', () => {
    for (const status of [500, 502, 503, 408, 429]) {
      expect(nextRetry({ status }, 1)).toMatchObject({ retry: true });
    }
    expect(nextRetry({ code: 'ECONNRESET' }, 1)).toMatchObject({ retry: true });
  });

  it('does not retry a receiver that will refuse just as firmly next time', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(nextRetry({ status }, 1)).toEqual({ retry: false, reason: 'permanent' });
    }
  });

  it('stops once the attempts are exhausted, however retryable the failure', () => {
    expect(nextRetry({ status: 503 }, 5)).toEqual({ retry: false, reason: 'exhausted' });
  });
});

describe('event subscription', () => {
  /** Empty means every event, following `ProductIvrPolicy.allowedTiers`. */
  it('treats an empty subscription list as every event', () => {
    expect(subscribes([], 'ticket.resolved')).toBe(true);
    expect(subscribes([], 'support.update')).toBe(true);
    expect(subscribes([], 'ticket.something_invented')).toBe(false);
  });

  it('takes a non-empty list literally', () => {
    expect(subscribes(['ticket.resolved'], 'ticket.resolved')).toBe(true);
    expect(subscribes(['ticket.resolved'], 'support.update')).toBe(false);
  });
});
