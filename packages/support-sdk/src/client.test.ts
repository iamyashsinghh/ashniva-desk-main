import { SupportClient } from './client';
import type { SupportCapabilities, SupportSession } from './contract';
import { SupportRequestError, type SupportRequest, type SupportTransport } from './transport';
import { SupportValidationError } from './validation';

const capabilities: SupportCapabilities = {
  productCode: 'CARELIX',
  productName: 'Carelix',
  canRaiseTicket: true,
  canRequestCall: false,
  unavailableReason: null,
  callUnavailableReason: 'Support calls are not part of the basic tier',
  allowedSources: [],
  allowedWorkAreas: ['API'],
  defaultPriority: 'MEDIUM',
  defaultType: 'SUPPORT',
  attachmentsEnabled: true,
};

function inFuture(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Records what was sent, and answers with whatever the test queued. */
function recordingTransport(
  answers: Array<{ status: number; body: unknown }>,
): SupportTransport & { sent: SupportRequest[] } {
  const sent: SupportRequest[] = [];
  return {
    sent,
    async send(request) {
      sent.push(request);
      return answers.shift() ?? { status: 200, body: capabilities };
    },
  };
}

describe('SupportClient', () => {
  it('mints a session once and reuses it across calls', async () => {
    let minted = 0;
    const transport = recordingTransport([]);
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport,
      session: (): SupportSession => {
        minted += 1;
        return { token: `askp_token${minted}`, expiresAt: inFuture(15) };
      },
    });

    await client.capabilities();
    await client.capabilities();

    expect(minted).toBe(1);
    expect(transport.sent.map((request) => request.token)).toEqual(['askp_token1', 'askp_token1']);
  });

  it('mints a new session when the current one is about to expire', async () => {
    let minted = 0;
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport: recordingTransport([]),
      refreshLeadSeconds: 60,
      session: (): SupportSession => {
        minted += 1;
        // Thirty seconds left is inside the sixty-second lead, so it is treated as spent.
        return {
          token: `askp_token${minted}`,
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
        };
      },
    });

    await client.capabilities();
    await client.capabilities();

    expect(minted).toBe(2);
  });

  it('re-mints once when the server refuses the token, and gives up after that', async () => {
    let minted = 0;
    const transport = recordingTransport([
      { status: 401, body: { message: 'Present a support session token' } },
      { status: 200, body: capabilities },
    ]);
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport,
      session: (): SupportSession => {
        minted += 1;
        return { token: `askp_token${minted}`, expiresAt: inFuture(15) };
      },
    });

    await expect(client.capabilities()).resolves.toEqual(capabilities);
    expect(minted).toBe(2);
    expect(transport.sent.map((request) => request.token)).toEqual(['askp_token1', 'askp_token2']);
  });

  it('does not retry a refusal that is not about the token', async () => {
    let minted = 0;
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport: recordingTransport([
        { status: 403, body: { message: 'Support is not enabled for this product' } },
      ]),
      session: (): SupportSession => {
        minted += 1;
        return { token: 'askp_token', expiresAt: inFuture(15) };
      },
    });

    await expect(client.capabilities()).rejects.toThrow('Support is not enabled for this product');
    expect(minted).toBe(1);
  });

  it('validates before sending, so a bad issue costs no request', async () => {
    const transport = recordingTransport([]);
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport,
      session: () => ({ token: 'askp_token', expiresAt: inFuture(15) }),
    });

    await expect(client.submitIssue({ subject: 'no', description: 'x' })).rejects.toBeInstanceOf(
      SupportValidationError,
    );
    expect(transport.sent).toHaveLength(0);
  });

  it('sends the idempotency key as a header, so a retry is one ticket', async () => {
    const transport = recordingTransport([
      {
        status: 201,
        body: { ticketId: 't', key: 'T-1', status: 'NEW', createdAt: '', duplicate: false },
      },
    ]);
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport,
      session: () => ({ token: 'askp_token', expiresAt: inFuture(15) }),
    });

    await client.submitIssue(
      { subject: 'Sync broke', description: 'Templates stopped syncing.' },
      { idempotencyKey: 'attempt-1' },
    );
    expect(transport.sent[0]?.headers?.['idempotency-key']).toBe('attempt-1');
  });

  it('never sends a requester identity — that comes from the token', async () => {
    const transport = recordingTransport([
      {
        status: 201,
        body: { ticketId: 't', key: 'T-1', status: 'NEW', createdAt: '', duplicate: false },
      },
    ]);
    const client = new SupportClient({
      baseUrl: 'https://desk.example.com/api/v1',
      transport,
      session: () => ({ token: 'askp_token', expiresAt: inFuture(15) }),
    });

    await client.submitIssue({ subject: 'Sync broke', description: 'Templates stopped syncing.' });
    const body = transport.sent[0]?.body as Record<string, unknown>;
    for (const field of ['externalUserId', 'requesterName', 'requesterEmail', 'requesterPhone']) {
      expect(body).not.toHaveProperty(field);
    }
  });

  it('turns a transport failure into a retryable error', () => {
    const error = new SupportRequestError('Support could not be reached');
    expect(error.retryable).toBe(true);
    expect(new SupportRequestError('nope', 403).retryable).toBe(false);
    expect(new SupportRequestError('later', 429).retryable).toBe(true);
  });
});
