import { Decimal } from './money';
import {
  autoAllocate,
  isAllocatable,
  planAllocation,
  unallocatedOf,
  type AllocatableInvoice,
} from './payment-allocation';

const d = (value: string | number) => new Decimal(value);

const invoice = (over: Partial<AllocatableInvoice> = {}): AllocatableInvoice => ({
  id: 'inv-1',
  status: 'ISSUED',
  balanceDue: d(1000),
  currency: 'INR',
  ...over,
});

describe('isAllocatable', () => {
  it('accepts an invoice that has been sent and still owes', () => {
    for (const status of ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const) {
      expect(isAllocatable(status)).toBe(true);
    }
  });

  it('refuses a settled invoice, rather than leaning on the balance check to catch it', () => {
    // `PAID` used to be in this set, which made the only guard against allocating twice against
    // one invoice the balance arithmetic downstream. A set named "allocatable" that includes a
    // settled invoice is a widened condition waiting for the arithmetic to be refactored.
    expect(isAllocatable('PAID')).toBe(false);
    expect(isAllocatable('DRAFT')).toBe(false);
    expect(isAllocatable('CANCELLED')).toBe(false);
    expect(isAllocatable('VOID')).toBe(false);
  });

  it('refuses a draft, a cancelled and a void invoice', () => {
    // A draft has not been sent, so there is nothing for the client to have paid.
    for (const status of ['DRAFT', 'CANCELLED', 'VOID'] as const) {
      expect(isAllocatable(status)).toBe(false);
    }
  });
});

describe('planAllocation', () => {
  it('settles an invoice in full and marks it paid', () => {
    const result = planAllocation(
      d(1000),
      d(0),
      [{ invoiceId: 'inv-1', amount: d(1000) }],
      [invoice()],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]).toMatchObject({ invoiceId: 'inv-1', newStatus: 'PAID' });
    expect(result.entries[0]?.newBalanceDue.toFixed(2)).toBe('0.00');
    expect(result.unallocated.toFixed(2)).toBe('0.00');
  });

  it('records a part payment and leaves a balance', () => {
    const result = planAllocation(
      d(400),
      d(0),
      [{ invoiceId: 'inv-1', amount: d(400) }],
      [invoice()],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]?.newStatus).toBe('PARTIALLY_PAID');
    expect(result.entries[0]?.newBalanceDue.toFixed(2)).toBe('600.00');
  });

  it('spreads one payment across several invoices', () => {
    const result = planAllocation(
      d(1500),
      d(0),
      [
        { invoiceId: 'inv-1', amount: d(1000) },
        { invoiceId: 'inv-2', amount: d(500) },
      ],
      [invoice(), invoice({ id: 'inv-2', balanceDue: d(800) })],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]?.newStatus).toBe('PARTIALLY_PAID');
  });

  it('keeps the remainder as unallocated rather than forcing it somewhere', () => {
    const result = planAllocation(
      d(1500),
      d(0),
      [{ invoiceId: 'inv-1', amount: d(1000) }],
      [invoice()],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.unallocated.toFixed(2)).toBe('500.00');
  });
});

describe('planAllocation — what it refuses', () => {
  it('refuses to overpay an invoice', () => {
    // Absorbing the excess silently is a discrepancy nobody finds until a reconciliation.
    const result = planAllocation(
      d(2000),
      d(0),
      [{ invoiceId: 'inv-1', amount: d(1500) }],
      [invoice()],
    );
    expect(result).toMatchObject({ ok: false, reason: 'overpayment' });
  });

  it('refuses to allocate more than the payment holds', () => {
    const result = planAllocation(
      d(500),
      d(0),
      [{ invoiceId: 'inv-1', amount: d(800) }],
      [invoice()],
    );
    expect(result).toMatchObject({ ok: false, reason: 'exceeds-payment' });
  });

  it('accounts for what the payment has already settled', () => {
    // 1000 received, 700 already applied elsewhere: only 300 is left.
    const result = planAllocation(
      d(1000),
      d(700),
      [{ invoiceId: 'inv-1', amount: d(400) }],
      [invoice()],
    );
    expect(result).toMatchObject({ ok: false, reason: 'exceeds-payment' });
  });

  it('refuses an invoice it was not given', () => {
    const result = planAllocation(
      d(500),
      d(0),
      [{ invoiceId: 'other-tenant', amount: d(500) }],
      [invoice()],
    );
    expect(result).toMatchObject({ ok: false, reason: 'unknown-invoice' });
  });

  it('refuses a draft or void invoice', () => {
    for (const status of ['DRAFT', 'VOID', 'CANCELLED'] as const) {
      const result = planAllocation(
        d(500),
        d(0),
        [{ invoiceId: 'inv-1', amount: d(500) }],
        [invoice({ status })],
      );
      expect(result).toMatchObject({ ok: false, reason: 'not-allocatable' });
    }
  });

  it('refuses zero and negative amounts', () => {
    for (const amount of [d(0), d(-100)]) {
      expect(
        planAllocation(d(500), d(0), [{ invoiceId: 'inv-1', amount }], [invoice()]),
      ).toMatchObject({ ok: false, reason: 'invalid-amount' });
    }
  });

  it('refuses the whole request when one entry is bad, not just that entry', () => {
    // A partly applied batch would leave the payment and the invoices disagreeing.
    const result = planAllocation(
      d(2000),
      d(0),
      [
        { invoiceId: 'inv-1', amount: d(1000) },
        { invoiceId: 'inv-2', amount: d(9999) },
      ],
      [invoice(), invoice({ id: 'inv-2', balanceDue: d(500) })],
    );
    expect(result.ok).toBe(false);
  });
});

describe('planAllocation — precision', () => {
  it('settles a balance with awkward paise exactly', () => {
    const result = planAllocation(
      d('1234.57'),
      d(0),
      [{ invoiceId: 'inv-1', amount: d('1234.57') }],
      [invoice({ balanceDue: d('1234.57') })],
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries[0]?.newBalanceDue.toFixed(2)).toBe('0.00');
    expect(result.entries[0]?.newStatus).toBe('PAID');
  });

  it('does not leave a stray paisa after several part payments', () => {
    let balance = d('1000.00');
    for (const amount of ['333.33', '333.33', '333.34']) {
      const result = planAllocation(
        d(amount),
        d(0),
        [{ invoiceId: 'inv-1', amount: d(amount) }],
        [invoice({ balanceDue: balance })],
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      balance = result.entries[0]!.newBalanceDue;
    }
    expect(balance.toFixed(2)).toBe('0.00');
  });
});

describe('autoAllocate', () => {
  it('clears the oldest invoice first', () => {
    const requests = autoAllocate(d(1200), [
      invoice({ id: 'oldest', balanceDue: d(1000) }),
      invoice({ id: 'newer', balanceDue: d(1000) }),
    ]);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ invoiceId: 'oldest' });
    expect(requests[0]?.amount.toFixed(2)).toBe('1000.00');
    expect(requests[1]?.amount.toFixed(2)).toBe('200.00');
  });

  it('stops when the money runs out', () => {
    const requests = autoAllocate(d(500), [
      invoice({ id: 'a', balanceDue: d(1000) }),
      invoice({ id: 'b', balanceDue: d(1000) }),
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.amount.toFixed(2)).toBe('500.00');
  });

  it('skips invoices that cannot take a payment', () => {
    const requests = autoAllocate(d(1000), [
      invoice({ id: 'draft', status: 'DRAFT' }),
      invoice({ id: 'settled', balanceDue: d(0), status: 'PAID' }),
      invoice({ id: 'open' }),
    ]);
    expect(requests.map((r) => r.invoiceId)).toEqual(['open']);
  });

  it('produces a plan that then validates', () => {
    const invoices = [
      invoice({ id: 'a', balanceDue: d('333.33') }),
      invoice({ id: 'b', balanceDue: d('666.67') }),
    ];
    const result = planAllocation(d(1000), d(0), autoAllocate(d(1000), invoices), invoices);
    expect(result.ok).toBe(true);
  });
});

describe('unallocatedOf', () => {
  it('is what is left', () => {
    expect(unallocatedOf(d(1000), [d(400), d(300)]).toFixed(2)).toBe('300.00');
    expect(unallocatedOf(d(1000), []).toFixed(2)).toBe('1000.00');
  });

  it('never goes negative', () => {
    expect(unallocatedOf(d(1000), [d(1500)]).toFixed(2)).toBe('0.00');
  });
});

describe('planAllocation and the same invoice twice', () => {
  it('refuses a request that names one invoice more than once', () => {
    // Each entry is checked against the invoice's balance on its own, so two entries of 600
    // against a 1000 balance would each pass and together overpay it by 200.
    const result = planAllocation(
      d(1200),
      d(0),
      [
        { invoiceId: 'inv-1', amount: d(600) },
        { invoiceId: 'inv-1', amount: d(600) },
      ],
      [invoice({ balanceDue: d(1000) })],
    );

    expect(result).toMatchObject({ ok: false, reason: 'duplicate-invoice' });
  });

  it('still allows two different invoices', () => {
    const result = planAllocation(
      d(1200),
      d(0),
      [
        { invoiceId: 'inv-1', amount: d(600) },
        { invoiceId: 'inv-2', amount: d(600) },
      ],
      [invoice({ balanceDue: d(1000) }), invoice({ id: 'inv-2', balanceDue: d(1000) })],
    );

    expect(result.ok).toBe(true);
  });
});

/**
 * Issue #13: a payment's currency was decorative.
 *
 * The column existed and nothing compared it with the invoice it was being applied to, so an
 * allocation across two currencies would have been accepted and the arithmetic done as if the
 * numbers were comparable. There is no conversion anywhere in this module, so the only honest
 * answer is to refuse.
 */
describe('planAllocation — currency', () => {
  const request = { invoiceId: 'inv-1', amount: d(500) };

  it('allows an allocation in the invoice’s own currency', () => {
    const plan = planAllocation(
      d(1000),
      d(0),
      [request],
      [invoice({ currency: 'INR' })],
      new Date(),
      new Map(),
      'INR',
    );
    expect(plan.ok).toBe(true);
  });

  it('refuses a payment in a different currency, and says which two', () => {
    const plan = planAllocation(
      d(1000),
      d(0),
      [request],
      [invoice({ currency: 'INR' })],
      new Date(),
      new Map(),
      'USD',
    );

    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe('currency-mismatch');
      expect(plan.message).toContain('USD');
      expect(plan.message).toContain('INR');
    }
  });

  it('does not silently convert, however small the difference', () => {
    // There is no rate table and no rounding rule for one. A refusal is the whole feature.
    const plan = planAllocation(
      d(1000),
      d(0),
      [request],
      [invoice({ currency: 'EUR' })],
      new Date(),
      new Map(),
      'GBP',
    );
    expect(plan.ok).toBe(false);
  });

  it('skips the check for a caller that does not supply a currency', () => {
    // The parameter is optional so the pure function stays usable from a test or a caller that
    // genuinely has no payment in hand; both service call sites do pass it.
    const plan = planAllocation(d(1000), d(0), [request], [invoice({ currency: 'INR' })]);
    expect(plan.ok).toBe(true);
  });
});
