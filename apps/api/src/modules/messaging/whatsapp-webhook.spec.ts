import { parseWhatsAppWebhook } from './whatsapp-webhook';

const envelope = (value: unknown) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'waba-123',
      changes: [{ field: 'messages', value }],
    },
  ],
});

describe('parseWhatsAppWebhook — what it reads', () => {
  it('reads the business account and phone number ids', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({ metadata: { phone_number_id: 'phone-1', display_phone_number: '+44123' } }),
    );
    expect(parsed.businessAccountId).toBe('waba-123');
    expect(parsed.phoneNumberId).toBe('phone-1');
  });

  it('reads a delivery status', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({
        statuses: [
          {
            id: 'wamid.1',
            status: 'delivered',
            timestamp: '1788700000',
            recipient_id: '919876543210',
          },
        ],
      }),
    );
    expect(parsed.events).toEqual([
      {
        kind: 'status',
        providerMessageId: 'wamid.1',
        recipientId: '919876543210',
        status: 'delivered',
        error: null,
        occurredAt: new Date(1_788_700_000 * 1000),
      },
    ]);
  });

  it('reports no recipient when Meta omits one, rather than inventing a destination', () => {
    // `recipientId` is what lets an unmatched receipt be reconciled with the message it belongs
    // to. Absent, the reconciliation declines to guess — so it has to read as absent, not as ''.
    const parsed = parseWhatsAppWebhook(
      envelope({ statuses: [{ id: 'wamid.1', status: 'delivered' }] }),
    );
    expect(parsed.events[0]).toMatchObject({ recipientId: null });
  });

  it('reads every status Meta sends', () => {
    for (const status of ['sent', 'delivered', 'read', 'failed']) {
      const parsed = parseWhatsAppWebhook(envelope({ statuses: [{ id: 'wamid.1', status }] }));
      expect(parsed.events[0]).toMatchObject({ status });
    }
  });

  it('reads an inbound message', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({
        messages: [
          { id: 'wamid.in', from: '447700900321', text: { body: 'Any update?' }, type: 'text' },
        ],
      }),
    );
    expect(parsed.events[0]).toMatchObject({
      kind: 'message',
      externalId: 'wamid.in',
      from: '447700900321',
      text: 'Any update?',
    });
  });

  it('reads statuses and messages arriving in one delivery', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({
        statuses: [{ id: 'wamid.1', status: 'read' }],
        messages: [{ id: 'wamid.2', from: '447700900321' }],
      }),
    );
    expect(parsed.events).toHaveLength(2);
  });
});

describe('parseWhatsAppWebhook — a failure status', () => {
  it('keeps the code and title', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({
        statuses: [
          {
            id: 'wamid.1',
            status: 'failed',
            errors: [{ code: 131_047, title: 'Re-engagement message' }],
          },
        ],
      }),
    );
    expect(parsed.events[0]).toMatchObject({
      status: 'failed',
      error: '131047: Re-engagement message',
    });
  });

  it('does not keep the details Meta echoes back', () => {
    // error_data.details quotes parts of our request, and this string is written to a column an
    // administrator reads.
    const parsed = parseWhatsAppWebhook(
      envelope({
        statuses: [
          {
            id: 'wamid.1',
            status: 'failed',
            errors: [
              {
                code: 190,
                title: 'Invalid token',
                error_data: { details: 'token EAAG-secret-value-here is invalid' },
              },
            ],
          },
        ],
      }),
    );
    expect(parsed.events[0]).toMatchObject({ error: '190: Invalid token' });
    expect(JSON.stringify(parsed)).not.toContain('EAAG-secret-value-here');
  });
});

describe('parseWhatsAppWebhook — malformed input', () => {
  it('returns nothing for a payload that is not a WhatsApp delivery', () => {
    for (const body of [null, undefined, 'a string', 42, [], {}, { object: 'page' }]) {
      expect(parseWhatsAppWebhook(body)).toEqual({
        businessAccountId: null,
        phoneNumberId: null,
        events: [],
      });
    }
  });

  it('does not throw on entries of the wrong shape', () => {
    const bodies = [
      { object: 'whatsapp_business_account', entry: 'not-an-array' },
      { object: 'whatsapp_business_account', entry: [null, 5, 'x'] },
      { object: 'whatsapp_business_account', entry: [{ id: 'w', changes: {} }] },
      { object: 'whatsapp_business_account', entry: [{ id: 'w', changes: [{ value: null }] }] },
    ];
    for (const body of bodies) {
      expect(() => parseWhatsAppWebhook(body)).not.toThrow();
      expect(parseWhatsAppWebhook(body).events).toEqual([]);
    }
  });

  it('drops a status with no id, rather than matching every message', () => {
    // A status row with no id would otherwise be looked up as `providerMessageId: undefined`.
    const parsed = parseWhatsAppWebhook(envelope({ statuses: [{ status: 'delivered' }] }));
    expect(parsed.events).toEqual([]);
  });

  it('drops a status whose state it does not recognise', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({ statuses: [{ id: 'wamid.1', status: 'DROP TABLE messages' }] }),
    );
    expect(parsed.events).toEqual([]);
  });

  it('drops a message with no sender', () => {
    const parsed = parseWhatsAppWebhook(envelope({ messages: [{ id: 'wamid.1' }] }));
    expect(parsed.events).toEqual([]);
  });

  it('ignores a non-string id rather than coercing it', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({ statuses: [{ id: { $ne: null }, status: 'sent' }] }),
    );
    expect(parsed.events).toEqual([]);
  });

  it('falls back to now for a missing or nonsense timestamp', () => {
    for (const timestamp of [undefined, 'not-a-number', '-5', '0']) {
      const parsed = parseWhatsAppWebhook(
        envelope({ statuses: [{ id: 'wamid.1', status: 'sent', timestamp }] }),
      );
      expect(parsed.events[0]?.occurredAt).toBeInstanceOf(Date);
    }
  });

  it('reads only the text body, not media or location payloads', () => {
    const parsed = parseWhatsAppWebhook(
      envelope({
        messages: [
          {
            id: 'wamid.1',
            from: '447700900321',
            type: 'location',
            location: { latitude: 51.5, longitude: -0.1 },
          },
        ],
      }),
    );
    expect(parsed.events[0]).toMatchObject({ text: null });
    expect(JSON.stringify(parsed)).not.toContain('51.5');
  });
});
