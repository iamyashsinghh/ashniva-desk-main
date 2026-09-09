import { DEEP_LINK_PREFIXES, linkingConfig, resolveDeepLink } from './deep-links';

/**
 * Deep links.
 *
 * A push payload arrives from a service outside the app, so `resolveDeepLink` treats it the way
 * the API treats a webhook body: nothing in it is trusted, everything is checked against a list.
 */

const VALID_ID = '0199c6a4-3b7d-7c1e-9f2a-6b1c8d4e5f60';

describe('resolveDeepLink — what it accepts', () => {
  it('opens a ticket', () => {
    expect(resolveDeepLink({ screen: 'TicketDetail', id: VALID_ID })).toEqual({
      screen: 'TicketDetail',
      params: { id: VALID_ID },
    });
  });

  it('opens a screen that needs no id', () => {
    expect(resolveDeepLink({ screen: 'Tasks' })).toEqual({ screen: 'Tasks' });
  });

  it('opens an approval request and a sign-off', () => {
    expect(resolveDeepLink({ screen: 'ApprovalDetail', id: VALID_ID })).toEqual({
      screen: 'ApprovalDetail',
      params: { id: VALID_ID },
    });
    expect(resolveDeepLink({ screen: 'SignOff', id: VALID_ID })).toEqual({
      screen: 'SignOff',
      params: { id: VALID_ID },
    });
  });
});

describe('resolveDeepLink — what it refuses', () => {
  it('falls back for a screen this app does not have', () => {
    // A notification about an audit entry should land somewhere real, not a dead route.
    expect(resolveDeepLink({ screen: 'AuditLog', id: VALID_ID })).toEqual({
      screen: 'Notifications',
    });
  });

  it('refuses an id that is not a UUID', () => {
    for (const id of ['../../admin', '1 OR 1=1', '<script>', '']) {
      expect(resolveDeepLink({ screen: 'TicketDetail', id })).toEqual({ screen: 'Notifications' });
    }
  });

  it('refuses a new detail screen with no id, the same as an old one', () => {
    for (const screen of ['ApprovalDetail', 'SignOff', 'ReleaseNote']) {
      expect(resolveDeepLink({ screen })).toEqual({ screen: 'Notifications' });
    }
  });

  it('refuses a payload that is not an object', () => {
    for (const payload of [null, undefined, 'TicketDetail', 42, []]) {
      expect(resolveDeepLink(payload)).toEqual({ screen: 'Notifications' });
    }
  });

  it('refuses a screen name that is not a string', () => {
    expect(resolveDeepLink({ screen: 123, id: VALID_ID })).toEqual({ screen: 'Notifications' });
  });

  it('ignores extra fields rather than passing them through', () => {
    const resolved = resolveDeepLink({
      screen: 'TicketDetail',
      id: VALID_ID,
      organizationId: 'someone-elses-org',
    });
    expect(resolved.params).toEqual({ id: VALID_ID });
  });
});

describe('the linking configuration', () => {
  it('accepts the app scheme and an https link', () => {
    expect(DEEP_LINK_PREFIXES).toContain('ashnivadesk://');
    expect(DEEP_LINK_PREFIXES.some((prefix) => prefix.startsWith('https://'))).toBe(true);
  });

  it('maps the detail routes that take an id', () => {
    const screens = linkingConfig.screens as Record<string, unknown>;
    expect(screens.TaskDetail).toBe('tasks/:id');
    expect(screens.TicketDetail).toBe('tickets/:id');
    expect(screens.InvoiceDetail).toBe('invoices/:id');
  });
});
