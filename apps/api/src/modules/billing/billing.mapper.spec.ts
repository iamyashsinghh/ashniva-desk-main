import { toCalculationPreview, toInvoiceDetail } from './billing.mapper';
import { toPortalInvoiceDetail } from './portal-billing.mapper';
import { calculateInvoice, type SupplyType } from './invoice-calculator';
import { Decimal } from './money';
import type { InvoiceDetailRow } from './billing.repository';

/**
 * What the mappers report, as opposed to what the calculator computes.
 *
 * This layer exists on its own because a stored line carries the rate as *entered* — that column
 * is the input a PATCH round-trips through — while every reader has to show the rate as
 * *applied*. The calculator is right either way, which is why testing it proves nothing about
 * this: an earlier fix was verified against the calculator and left four reader surfaces showing
 * "18% GST" beside a zero tax amount on an export invoice.
 */

const D = (value: string) => new Decimal(value);

/** A line as Postgres holds it for a ₹1,00,000 supply quoted at 18%. */
function storedLine(over: Partial<InvoiceDetailRow['lineItems'][number]> = {}) {
  return {
    id: 'line-1',
    invoiceId: 'inv-1',
    position: 0,
    description: 'Integration work',
    hsnSac: '998314',
    quantity: D('1.000'),
    unit: 'Nos',
    unitPrice: D('100000.0000'),
    discountPercent: D('0.00'),
    discountAmount: D('0.00'),
    // Entered, not applied. On an export invoice this stays 18 and the amounts below are zero.
    taxRate: D('18.00'),
    taxableValue: D('100000.00'),
    cgstAmount: D('0.00'),
    sgstAmount: D('0.00'),
    igstAmount: D('0.00'),
    lineTotal: D('100000.00'),
    source: 'MANUAL' as const,
    sourceRefId: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    ...over,
  };
}

function storedBreakdown(over: Partial<InvoiceDetailRow['taxBreakdown'][number]> = {}) {
  return {
    id: 'tax-1',
    invoiceId: 'inv-1',
    taxRate: D('18.00'),
    hsnSac: '998314',
    taxableValue: D('100000.00'),
    cgstAmount: D('0.00'),
    sgstAmount: D('0.00'),
    igstAmount: D('0.00'),
    totalTax: D('0.00'),
    ...over,
  };
}

function invoiceRow(over: Partial<InvoiceDetailRow> = {}): InvoiceDetailRow {
  return {
    id: 'inv-1',
    organizationId: 'org-1',
    clientOrganizationId: 'client-1',
    number: 7,
    numberLabel: 'INV/2026-27/0007',
    financialYear: '2026-27',
    status: 'ISSUED',
    projectId: null,
    contractId: null,
    milestoneId: null,
    changeRequestId: null,
    issueDate: new Date('2026-09-01T00:00:00.000Z'),
    dueDate: new Date('2026-10-01T00:00:00.000Z'),
    currency: 'INR',
    placeOfSupplyState: 'Karnataka',
    placeOfSupplyCode: '29',
    supplyType: 'EXPORT',
    taxTreatment: 'EXCLUSIVE',
    reverseCharge: false,
    subtotal: D('100000.00'),
    discountTotal: D('0.00'),
    taxableValue: D('100000.00'),
    cgstTotal: D('0.00'),
    sgstTotal: D('0.00'),
    igstTotal: D('0.00'),
    taxTotal: D('0.00'),
    roundingAdjustment: D('0.00'),
    total: D('100000.00'),
    amountPaid: D('0.00'),
    balanceDue: D('100000.00'),
    amountInWords: 'Rupees One Lakh Only',
    notes: null,
    internalNotes: 'Margin is thin on this one',
    snapshot: null,
    pdfFileId: null,
    issuedById: 'user-1',
    issuedAt: new Date('2026-09-01T00:00:00.000Z'),
    cancelledById: null,
    cancelledAt: null,
    cancelReason: null,
    voidedById: null,
    voidedAt: null,
    voidReason: null,
    lastReminderAt: null,
    createdById: 'user-1',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    deletedAt: null,
    clientOrganization: { id: 'client-1', name: 'Zenith Retail' },
    lineItems: [storedLine()],
    taxBreakdown: [storedBreakdown()],
    allocations: [],
    history: [],
    ...over,
  };
}

/** The same supply charged intra-state, so the stored rate and the applied rate agree. */
function domesticRow(): InvoiceDetailRow {
  return invoiceRow({
    supplyType: 'INTRA_STATE',
    cgstTotal: D('9000.00'),
    sgstTotal: D('9000.00'),
    taxTotal: D('18000.00'),
    total: D('118000.00'),
    balanceDue: D('118000.00'),
    lineItems: [
      storedLine({
        cgstAmount: D('9000.00'),
        sgstAmount: D('9000.00'),
        lineTotal: D('118000.00'),
      }),
    ],
    taxBreakdown: [
      storedBreakdown({
        cgstAmount: D('9000.00'),
        sgstAmount: D('9000.00'),
        totalTax: D('18000.00'),
      }),
    ],
  });
}

/** The same supply charged inter-state, so the whole rate lands as IGST. */
function interStateRow(): InvoiceDetailRow {
  return invoiceRow({
    supplyType: 'INTER_STATE',
    igstTotal: D('18000.00'),
    taxTotal: D('18000.00'),
    total: D('118000.00'),
    balanceDue: D('118000.00'),
    lineItems: [storedLine({ igstAmount: D('18000.00'), lineTotal: D('118000.00') })],
    taxBreakdown: [storedBreakdown({ igstAmount: D('18000.00'), totalTax: D('18000.00') })],
  });
}

describe('toInvoiceDetail — the rate a reader is given', () => {
  for (const supplyType of ['EXPORT', 'EXEMPT'] as const) {
    it(`reports 0.00 on an ${supplyType} line even though the row stores 18.00`, () => {
      const row = invoiceRow({ supplyType });
      const detail = toInvoiceDetail(row);

      // The stored column is untouched — that is the round-trip input.
      expect(row.lineItems[0]?.taxRate.toFixed(2)).toBe('18.00');
      expect(detail.lineItems[0]?.taxRate).toBe('0.00');
      expect(detail.lineItems[0]?.cgstAmount).toBe('0.00');
      expect(detail.lineItems[0]?.sgstAmount).toBe('0.00');
      expect(detail.lineItems[0]?.igstAmount).toBe('0.00');
    });

    it(`reports 0.00 in the ${supplyType} tax breakdown`, () => {
      const detail = toInvoiceDetail(invoiceRow({ supplyType }));
      expect(detail.taxBreakdown[0]?.taxRate).toBe('0.00');
      expect(detail.taxBreakdown[0]?.totalTax).toBe('0.00');
    });
  }

  it('reports the full rate on an intra-state line', () => {
    const detail = toInvoiceDetail(domesticRow());
    expect(detail.lineItems[0]?.taxRate).toBe('18.00');
    expect(detail.taxBreakdown[0]?.taxRate).toBe('18.00');
  });

  it('reports the full rate on an inter-state line', () => {
    const detail = toInvoiceDetail(interStateRow());
    expect(detail.lineItems[0]?.taxRate).toBe('18.00');
    expect(detail.taxBreakdown[0]?.taxRate).toBe('18.00');
  });

  it('still shows the rate under reverse charge, which is tax shown but not collected', () => {
    const detail = toInvoiceDetail(domesticRow());
    expect(detail.lineItems[0]?.taxRate).toBe('18.00');
  });

  it('never reports a rate on a line that carries no tax', () => {
    // The property every reader surface depends on, over rows consistent with their supply type:
    // a rate is shown only where there is tax to go with it. "18% GST" beside 0.00 is the defect.
    for (const row of [domesticRow(), interStateRow(), invoiceRow({ supplyType: 'EXEMPT' })]) {
      for (const line of toInvoiceDetail(row).lineItems) {
        const hasTax =
          line.cgstAmount !== '0.00' || line.sgstAmount !== '0.00' || line.igstAmount !== '0.00';
        expect(line.taxRate === '0.00').toBe(!hasTax);
      }
    }
  });
});

describe('toPortalInvoiceDetail — the same rule on the client surface', () => {
  it('reports 0.00 on an export line', () => {
    const portal = toPortalInvoiceDetail(invoiceRow({ supplyType: 'EXPORT' }));
    expect(portal.lineItems[0]?.taxRate).toBe('0.00');
    expect(portal.taxBreakdown[0]?.taxRate).toBe('0.00');
  });

  it('reports the full rate on a domestic line', () => {
    const portal = toPortalInvoiceDetail(domesticRow());
    expect(portal.lineItems[0]?.taxRate).toBe('18.00');
    expect(portal.taxBreakdown[0]?.taxRate).toBe('18.00');
  });

  it('agrees with the internal mapper on every supply type', () => {
    // The portal has its own mapper on purpose. That is exactly why the two can disagree, and a
    // client seeing a different rate from the provider on the same invoice is the worse failure.
    for (const supplyType of ['INTRA_STATE', 'INTER_STATE', 'EXPORT', 'EXEMPT'] as const) {
      const row = { ...domesticRow(), supplyType };
      expect(toPortalInvoiceDetail(row).lineItems[0]?.taxRate).toBe(
        toInvoiceDetail(row).lineItems[0]?.taxRate,
      );
      expect(toPortalInvoiceDetail(row).taxBreakdown[0]?.taxRate).toBe(
        toInvoiceDetail(row).taxBreakdown[0]?.taxRate,
      );
    }
  });
});

describe('toCalculationPreview — the rate before anything is saved', () => {
  const lines = [
    {
      description: 'Integration work',
      hsnSac: '998314',
      quantity: new Decimal('1'),
      unitPrice: new Decimal('100000'),
      taxRate: new Decimal('18'),
    },
  ];

  const preview = (supplyType: SupplyType) =>
    toCalculationPreview(
      calculateInvoice({ lines, supplyType, taxTreatment: 'EXCLUSIVE' }),
      supplyType,
      [{ unit: 'Nos' }],
    );

  it('reports 0.00 for an export preview', () => {
    const result = preview('EXPORT');
    expect(result.lines[0]?.taxRate).toBe('0.00');
    expect(result.taxBreakdown[0]?.taxRate).toBe('0.00');
    expect(result.taxTotal).toBe('0.00');
    expect(result.total).toBe('100000.00');
  });

  it('reports 18.00 for an intra-state preview', () => {
    const result = preview('INTRA_STATE');
    expect(result.lines[0]?.taxRate).toBe('18.00');
    expect(result.taxBreakdown[0]?.taxRate).toBe('18.00');
    expect(result.total).toBe('118000.00');
  });

  it('matches what the saved invoice will report for the same supply', () => {
    // A preview that disagrees with the invoice it previews is the defect this pair guards.
    expect(preview('EXPORT').lines[0]?.taxRate).toBe(
      toInvoiceDetail(invoiceRow({ supplyType: 'EXPORT' })).lineItems[0]?.taxRate,
    );
    expect(preview('INTRA_STATE').lines[0]?.taxRate).toBe(
      toInvoiceDetail(domesticRow()).lineItems[0]?.taxRate,
    );
  });
});

describe('the tax breakdown a reader is given', () => {
  /** Two lines quoted at different rates against one HSN — indistinguishable once shown at 0%. */
  function twoRates(supplyType: SupplyType): InvoiceDetailRow {
    return invoiceRow({
      supplyType,
      taxableValue: D('140000.00'),
      taxBreakdown: [
        storedBreakdown({ taxableValue: D('100000.00') }),
        storedBreakdown({ id: 'tax-2', taxRate: D('5.00'), taxableValue: D('40000.00') }),
      ],
    });
  }

  it('merges rows that present at the same rate on an export invoice', () => {
    const detail = toInvoiceDetail(twoRates('EXPORT'));

    expect(detail.taxBreakdown).toHaveLength(1);
    expect(detail.taxBreakdown[0]?.taxRate).toBe('0.00');
    expect(detail.taxBreakdown[0]?.taxableValue).toBe('140000.00');
  });

  it('preserves the taxable total exactly when it merges', () => {
    // The property that makes regrouping safe: merging cells of a partition cannot change the sum.
    for (const supplyType of ['INTRA_STATE', 'INTER_STATE', 'EXPORT', 'EXEMPT'] as const) {
      const row = twoRates(supplyType);
      const detail = toInvoiceDetail(row);
      const summed = detail.taxBreakdown.reduce(
        (total, tax) => total.plus(new Decimal(tax.taxableValue)),
        new Decimal(0),
      );
      expect(summed.toFixed(2)).toBe(row.taxableValue.toFixed(2));
    }
  });

  it('leaves the rows alone on a taxable supply', () => {
    // Applied rate equals entered rate there, so this must be a no-op — including the ordering.
    const detail = toInvoiceDetail(twoRates('INTER_STATE'));
    expect(detail.taxBreakdown.map((tax) => tax.taxRate)).toEqual(['18.00', '5.00']);
  });

  it('does not merge rows that differ by HSN', () => {
    const detail = toInvoiceDetail(
      invoiceRow({
        supplyType: 'EXPORT',
        taxBreakdown: [
          storedBreakdown({ taxableValue: D('100000.00') }),
          storedBreakdown({ id: 'tax-2', hsnSac: '998313', taxableValue: D('40000.00') }),
        ],
      }),
    );
    expect(detail.taxBreakdown).toHaveLength(2);
  });

  it('reports the same breakdown to the client as to the provider', () => {
    const row = twoRates('EXPORT');
    expect(toPortalInvoiceDetail(row).taxBreakdown).toEqual(toInvoiceDetail(row).taxBreakdown);
  });
});

describe('the unit price a reader is given', () => {
  it('keeps four places when the stored price has them', () => {
    const row = invoiceRow({
      lineItems: [storedLine({ unitPrice: D('1234.5678'), quantity: D('3.000') })],
    });
    expect(toInvoiceDetail(row).lineItems[0]?.unitPrice).toBe('1234.5678');
    expect(toPortalInvoiceDetail(row).lineItems[0]?.unitPrice).toBe('1234.5678');
  });

  it('shows an ordinary price in two places', () => {
    expect(toInvoiceDetail(invoiceRow()).lineItems[0]?.unitPrice).toBe('100000.00');
  });
});

/**
 * Issue #6: the preview reported a discount the saved row would keep.
 *
 * The calculator folds a percentage into the amount, so the calculated line no longer knows a
 * percentage was ever entered. The mapper used to answer `0.00` regardless, which made a preview
 * row and the row it previews differ in exactly one field — the one a user had just typed into.
 */
describe('toCalculationPreview — the discount a user typed', () => {
  const lines = [
    {
      description: 'Consulting',
      hsnSac: '998314',
      quantity: new Decimal('10'),
      unitPrice: new Decimal('1000'),
      discountPercent: new Decimal('10'),
      taxRate: new Decimal('18'),
    },
  ];

  const previewWith = (input: { unit?: string; discountPercent?: string }) =>
    toCalculationPreview(
      calculateInvoice({ lines, supplyType: 'INTRA_STATE', taxTreatment: 'EXCLUSIVE' }),
      'INTRA_STATE',
      [input],
    );

  it('echoes the percentage back rather than reporting none', () => {
    expect(previewWith({ discountPercent: '10' }).lines[0]?.discountPercent).toBe('10.00');
  });

  it('still reports the discount in the amount, so the two agree', () => {
    const line = previewWith({ discountPercent: '10' }).lines[0];
    expect(line?.discountPercent).toBe('10.00');
    expect(line?.discountAmount).toBe('1000.00');
  });

  it('reports 0.00 when the discount was given as an amount, not a percentage', () => {
    expect(previewWith({}).lines[0]?.discountPercent).toBe('0.00');
  });

  it('treats a blank or unparseable percentage as none rather than as NaN', () => {
    expect(previewWith({ discountPercent: '   ' }).lines[0]?.discountPercent).toBe('0.00');
    expect(previewWith({ discountPercent: 'ten' }).lines[0]?.discountPercent).toBe('0.00');
  });
});
