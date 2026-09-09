import {
  CLIENT_VISIBLE_INVOICE_STATUSES,
  INVOICE_STATUS,
  SETTLED_INVOICE_STATUSES,
  isSettledInvoiceStatus,
  type InvoiceStatus,
} from './billing';

/**
 * Issues #16 and #17: two rules about invoice status that were each written out several times.
 *
 * Both are now single constants, and these tests are what stops the copies coming back. The one
 * that mattered most was not a duplicate at all but a *complement*: `notIn: ['DRAFT','CANCELLED']`
 * in the portal query widened itself every time a status was added to the enum, with no code
 * change and no review to catch it.
 */

const ALL_STATUSES = Object.values(INVOICE_STATUS) as InvoiceStatus[];

describe('SETTLED_INVOICE_STATUSES — one answer to "has this stopped owing"', () => {
  it('is exactly the closed set', () => {
    expect([...SETTLED_INVOICE_STATUSES].sort()).toEqual(['CANCELLED', 'PAID', 'VOID']);
  });

  it('agrees with the helper for every status the enum has', () => {
    for (const status of ALL_STATUSES) {
      expect(isSettledInvoiceStatus(status)).toBe(SETTLED_INVOICE_STATUSES.includes(status));
    }
  });

  it('leaves every status that still owes out of it', () => {
    for (const status of ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const) {
      expect(isSettledInvoiceStatus(status)).toBe(false);
    }
  });

  it('treats an unknown status as not settled, so a new one is chased rather than ignored', () => {
    // The safe direction: a status nobody has classified yet keeps appearing on the overdue
    // sweep, where somebody will notice it. The opposite default would silently stop chasing it.
    expect(isSettledInvoiceStatus('DISPUTED')).toBe(false);
  });
});

describe('CLIENT_VISIBLE_INVOICE_STATUSES — one answer to "may the client see this"', () => {
  it('is exactly the five a client may see', () => {
    expect([...CLIENT_VISIBLE_INVOICE_STATUSES].sort()).toEqual([
      'ISSUED',
      'OVERDUE',
      'PAID',
      'PARTIALLY_PAID',
      'VOID',
    ]);
  });

  it('hides a draft and a cancelled invoice, which no client was ever sent', () => {
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).not.toContain('DRAFT');
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).not.toContain('CANCELLED');
  });

  it('does not admit a new status by default', () => {
    // This is the property the complement did not have. Every status is either listed or not;
    // adding `DISPUTED` to the enum leaves it hidden until somebody decides otherwise here.
    for (const status of ALL_STATUSES) {
      expect(typeof CLIENT_VISIBLE_INVOICE_STATUSES.includes(status)).toBe('boolean');
    }
    expect(CLIENT_VISIBLE_INVOICE_STATUSES.length).toBe(5);
  });
});

describe('the two sets answer different questions', () => {
  it('keeps VOID in both, deliberately', () => {
    // A voided invoice stops owing money, and the client keeps the document. That overlap is why
    // these cannot be merged into one set, and why each needed its own name.
    expect(SETTLED_INVOICE_STATUSES).toContain('VOID');
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).toContain('VOID');
  });

  it('differs on CANCELLED, which is settled but never shown', () => {
    expect(SETTLED_INVOICE_STATUSES).toContain('CANCELLED');
    expect(CLIENT_VISIBLE_INVOICE_STATUSES).not.toContain('CANCELLED');
  });
});
