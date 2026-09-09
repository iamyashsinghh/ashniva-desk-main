import type { SupportCapabilities } from './contract';
import type { SupportTransport } from './transport';
import { SupportWidget, type WidgetState } from './widget';

const open: SupportCapabilities = {
  productCode: 'CARELIX',
  productName: 'Carelix',
  canRaiseTicket: true,
  canRequestCall: true,
  unavailableReason: null,
  callUnavailableReason: null,
  allowedSources: [],
  allowedWorkAreas: [],
  defaultPriority: 'MEDIUM',
  defaultType: 'SUPPORT',
  attachmentsEnabled: true,
};

function widgetWith(answers: Array<{ status: number; body: unknown }>): SupportWidget {
  const transport: SupportTransport = {
    async send() {
      return answers.shift() ?? { status: 200, body: open };
    },
  };
  return new SupportWidget({
    baseUrl: 'https://desk.example.com/api/v1',
    transport,
    session: () => ({
      token: 'askp_token',
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    }),
  });
}

describe('the widget state machine', () => {
  it('delivers the current state to a new subscriber immediately', () => {
    const seen: WidgetState[] = [];
    widgetWith([]).subscribe((state) => seen.push(state));
    expect(seen).toEqual([{ kind: 'idle' }]);
  });

  it('goes to ready when support is open', async () => {
    const widget = widgetWith([{ status: 200, body: open }]);
    await widget.open();
    expect(widget.getState()).toEqual({ kind: 'ready', capabilities: open });
  });

  it('goes to unavailable, with the server’s sentence, when the tier is closed', async () => {
    const closed = {
      ...open,
      canRaiseTicket: false,
      unavailableReason: 'Raising tickets is not part of the basic tier',
    };
    const widget = widgetWith([{ status: 200, body: closed }]);
    await widget.open();
    expect(widget.getState()).toEqual({
      kind: 'unavailable',
      reason: 'Raising tickets is not part of the basic tier',
    });
  });

  /**
   * The distinction the states exist for: "support said no" and "the request never arrived" read
   * the same to a spinner and completely differently to the person waiting.
   */
  it('separates a refusal from an outage', async () => {
    const refused = widgetWith([{ status: 403, body: { message: 'Support is not enabled' } }]);
    await refused.open();
    expect(refused.getState().kind).toBe('unavailable');

    const offline = new SupportWidget({
      baseUrl: 'https://desk.example.com/api/v1',
      transport: {
        send() {
          return Promise.reject(new Error('Failed to fetch'));
        },
      },
      session: () => ({
        token: 'askp_token',
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
      }),
    });
    await offline.open();
    expect(offline.getState().kind).toBe('offline');
  });

  it('treats a session provider that fails as an outage rather than a refusal', async () => {
    const widget = new SupportWidget({
      baseUrl: 'https://desk.example.com/api/v1',
      transport: { send: () => Promise.resolve({ status: 200, body: open }) },
      session: () => Promise.reject(new Error('Our backend is down')),
    });
    await widget.open();
    expect(widget.getState()).toEqual({ kind: 'offline', reason: 'Our backend is down' });
  });

  it('carries the ticket reference into the submitted state, and resets back to the form', async () => {
    const ticket = { ticketId: 't1', key: 'T-42', status: 'NEW', createdAt: '', duplicate: false };
    const widget = widgetWith([
      { status: 200, body: open },
      { status: 201, body: ticket },
    ]);
    await widget.open();
    await widget.submit({ subject: 'Sync broke', description: 'Templates stopped syncing.' });
    expect(widget.getState()).toEqual({ kind: 'submitted', capabilities: open, ticket });
    widget.reset();
    expect(widget.getState()).toEqual({ kind: 'ready', capabilities: open });
  });

  it('stays on the form when validation fails, so the reporter can fix it', async () => {
    const widget = widgetWith([{ status: 200, body: open }]);
    await widget.open();
    await expect(widget.submit({ subject: 'no', description: 'x' })).rejects.toThrow();
    expect(widget.getState()).toEqual({ kind: 'ready', capabilities: open });
  });
});
