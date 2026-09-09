import { calculateInvoice, supplyTypeFor, type LineInput } from './invoice-calculator';
import { Decimal } from './money';

const d = (value: string | number) => new Decimal(value);

const line = (over: Partial<LineInput> = {}): LineInput => ({
  description: 'Consulting',
  hsnSac: '998314',
  quantity: d(1),
  unitPrice: d(1000),
  taxRate: d(18),
  ...over,
});

describe('intra-state supply', () => {
  it('splits the rate into equal CGST and SGST halves', () => {
    const result = calculateInvoice({
      lines: [line()],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    expect(result.taxableValue.toFixed(2)).toBe('1000.00');
    expect(result.cgstTotal.toFixed(2)).toBe('90.00');
    expect(result.sgstTotal.toFixed(2)).toBe('90.00');
    expect(result.igstTotal.toFixed(2)).toBe('0.00');
    expect(result.total.toFixed(2)).toBe('1180.00');
  });

  it('keeps the two halves adding back to the tax when the paise are odd', () => {
    // 18% of 333.33 is 59.9994 → 60.00, which does not halve evenly.
    const result = calculateInvoice({
      lines: [line({ unitPrice: d('333.33') })],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    const halves = result.cgstTotal.plus(result.sgstTotal);
    expect(halves.toFixed(2)).toBe(result.taxTotal.toFixed(2));
    expect(result.total.toFixed(2)).toBe(result.taxableValue.plus(result.taxTotal).toFixed(2));
  });
});

describe('inter-state supply', () => {
  it('charges the whole rate as IGST', () => {
    const result = calculateInvoice({
      lines: [line()],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    expect(result.igstTotal.toFixed(2)).toBe('180.00');
    expect(result.cgstTotal.toFixed(2)).toBe('0.00');
    expect(result.sgstTotal.toFixed(2)).toBe('0.00');
    expect(result.total.toFixed(2)).toBe('1180.00');
  });

  it('comes to the same total as the intra-state equivalent', () => {
    // Only the split differs; the customer pays the same either way.
    const intra = calculateInvoice({
      lines: [line()],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    const inter = calculateInvoice({
      lines: [line()],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(inter.total.toFixed(2)).toBe(intra.total.toFixed(2));
  });
});

describe('inclusive pricing', () => {
  it('extracts the tax from the entered price rather than adding to it', () => {
    // 1180 inclusive of 18% is 1000 taxable + 180 tax.
    const result = calculateInvoice({
      lines: [line({ unitPrice: d(1180) })],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'INCLUSIVE',
    });

    expect(result.taxableValue.toFixed(2)).toBe('1000.00');
    expect(result.taxTotal.toFixed(2)).toBe('180.00');
    expect(result.total.toFixed(2)).toBe('1180.00');
  });

  it('leaves the customer paying exactly the entered price', () => {
    for (const price of ['999', '1234.56', '75000', '1']) {
      const result = calculateInvoice({
        lines: [line({ unitPrice: d(price) })],
        supplyType: 'INTER_STATE',
        taxTreatment: 'INCLUSIVE',
      });
      expect(result.total.toFixed(2)).toBe(d(price).toFixed(2));
    }
  });

  it('differs from exclusive on the same entered price', () => {
    const inclusive = calculateInvoice({
      lines: [line()],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'INCLUSIVE',
    });
    const exclusive = calculateInvoice({
      lines: [line()],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(inclusive.total.toFixed(2)).toBe('1000.00');
    expect(exclusive.total.toFixed(2)).toBe('1180.00');
  });
});

describe('discounts', () => {
  it('applies a percentage before tax', () => {
    const result = calculateInvoice({
      lines: [line({ discountPercent: d(10) })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    expect(result.subtotal.toFixed(2)).toBe('1000.00');
    expect(result.discountTotal.toFixed(2)).toBe('100.00');
    expect(result.taxableValue.toFixed(2)).toBe('900.00');
    // Tax follows the discounted value, not the list price.
    expect(result.igstTotal.toFixed(2)).toBe('162.00');
    expect(result.total.toFixed(2)).toBe('1062.00');
  });

  it('applies a flat amount', () => {
    const result = calculateInvoice({
      lines: [line({ discountAmount: d(250) })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.taxableValue.toFixed(2)).toBe('750.00');
    expect(result.total.toFixed(2)).toBe('885.00');
  });

  it('subtracts both when both are given', () => {
    const result = calculateInvoice({
      lines: [line({ discountPercent: d(10), discountAmount: d(50) })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.discountTotal.toFixed(2)).toBe('150.00');
    expect(result.taxableValue.toFixed(2)).toBe('850.00');
  });
});

describe('rounding', () => {
  it('rounds the payable total to a whole rupee and shows the difference', () => {
    // 18% of 1234.56 gives a total of 1456.78.
    const result = calculateInvoice({
      lines: [line({ unitPrice: d('1234.56') })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
      roundTotal: true,
    });

    expect(result.total.toFixed(2)).toBe('1457.00');
    expect(result.roundingAdjustment.toFixed(2)).toBe('0.22');
    // The adjustment always reconciles the document.
    expect(
      result.taxableValue.plus(result.taxTotal).plus(result.roundingAdjustment).toFixed(2),
    ).toBe(result.total.toFixed(2));
  });

  it('can round down as well as up', () => {
    const result = calculateInvoice({
      lines: [line({ unitPrice: d('1000.20'), taxRate: d(0) })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
      roundTotal: true,
    });
    expect(result.total.toFixed(2)).toBe('1000.00');
    expect(result.roundingAdjustment.toFixed(2)).toBe('-0.20');
  });

  it('leaves the total alone when rounding is off', () => {
    const result = calculateInvoice({
      lines: [line({ unitPrice: d('1234.56') })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.total.toFixed(2)).toBe('1456.78');
    expect(result.roundingAdjustment.toFixed(2)).toBe('0.00');
  });
});

describe('decimal precision', () => {
  it('does not drift the way floating point would', () => {
    // Ten lines of 0.1 is exactly 1.00. In float arithmetic it is 0.9999999999999999.
    const lines = Array.from({ length: 10 }, () => line({ unitPrice: d('0.10'), taxRate: d(0) }));
    const result = calculateInvoice({
      lines,
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.total.toFixed(2)).toBe('1.00');
  });

  it('keeps four-place unit prices exact through the multiply', () => {
    const result = calculateInvoice({
      lines: [line({ quantity: d('7.500'), unitPrice: d('1234.5678'), taxRate: d(0) })],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    // 7.5 × 1234.5678 = 9259.2585 → 9259.26
    expect(result.taxableValue.toFixed(2)).toBe('9259.26');
  });

  it('totals equal the sum of the lines, to the paisa', () => {
    const lines = [
      line({ unitPrice: d('333.33'), taxRate: d(18) }),
      line({ unitPrice: d('66.67'), taxRate: d(18) }),
      line({ unitPrice: d('1.11'), taxRate: d(5) }),
    ];
    const result = calculateInvoice({
      lines,
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    const lineSum = result.lines.reduce((total, row) => total.plus(row.lineTotal), d(0));
    expect(result.total.toFixed(2)).toBe(lineSum.toFixed(2));
  });
});

describe('the tax breakdown table', () => {
  it('groups by rate and HSN, highest rate first', () => {
    const result = calculateInvoice({
      lines: [
        line({ unitPrice: d(1000), taxRate: d(18), hsnSac: '998314' }),
        line({ unitPrice: d(500), taxRate: d(18), hsnSac: '998314' }),
        line({ unitPrice: d(200), taxRate: d(5), hsnSac: '998313' }),
      ],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    expect(result.taxBreakdown).toHaveLength(2);
    expect(result.taxBreakdown[0]?.taxRate.toFixed(2)).toBe('18.00');
    expect(result.taxBreakdown[0]?.taxableValue.toFixed(2)).toBe('1500.00');
    expect(result.taxBreakdown[1]?.taxRate.toFixed(2)).toBe('5.00');
  });

  it('separates the same rate under different HSN codes', () => {
    // A tax return wants them apart even though the rate matches.
    const result = calculateInvoice({
      lines: [
        line({ taxRate: d(18), hsnSac: '998314' }),
        line({ taxRate: d(18), hsnSac: '998319' }),
      ],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.taxBreakdown).toHaveLength(2);
  });

  it('adds up to the invoice tax total', () => {
    const result = calculateInvoice({
      lines: [
        line({ unitPrice: d('1234.56'), taxRate: d(18) }),
        line({ unitPrice: d('789.01'), taxRate: d(12) }),
        line({ unitPrice: d('45.67'), taxRate: d(5) }),
      ],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
    });

    const breakdownTax = result.taxBreakdown.reduce((total, row) => total.plus(row.totalTax), d(0));
    expect(breakdownTax.toFixed(2)).toBe(result.taxTotal.toFixed(2));
  });
});

describe('supplies that carry no GST', () => {
  it('charges nothing on an export', () => {
    const result = calculateInvoice({
      lines: [line()],
      supplyType: 'EXPORT',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.taxTotal.toFixed(2)).toBe('0.00');
    expect(result.total.toFixed(2)).toBe('1000.00');
  });

  it('charges nothing on an exempt supply', () => {
    const result = calculateInvoice({
      lines: [line()],
      supplyType: 'EXEMPT',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.taxTotal.toFixed(2)).toBe('0.00');
  });

  it('does not strip tax from an inclusive price when the supply is untaxed', () => {
    // Nothing to extract: the price is the price.
    const result = calculateInvoice({
      lines: [line({ unitPrice: d(1180) })],
      supplyType: 'EXPORT',
      taxTreatment: 'INCLUSIVE',
    });
    expect(result.taxableValue.toFixed(2)).toBe('1180.00');
    expect(result.total.toFixed(2)).toBe('1180.00');
  });
});

describe('reverse charge', () => {
  it('shows the tax but does not collect it', () => {
    const result = calculateInvoice({
      lines: [line()],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'EXCLUSIVE',
      reverseCharge: true,
    });

    expect(result.taxTotal.toFixed(2)).toBe('180.00');
    // The recipient pays the tax to the government, so the supplier bills the taxable value only.
    expect(result.total.toFixed(2)).toBe('1000.00');
  });
});

describe('supplyTypeFor', () => {
  it('is intra-state when the place of supply matches the supplier’s state', () => {
    expect(supplyTypeFor('29', '29')).toBe('INTRA_STATE');
  });

  it('is inter-state when they differ', () => {
    expect(supplyTypeFor('29', '27')).toBe('INTER_STATE');
  });

  it('falls back to inter-state when a code is missing', () => {
    // IGST charged in error is correctable; a missing state share is a shortfall.
    expect(supplyTypeFor(null, '27')).toBe('INTER_STATE');
    expect(supplyTypeFor('29', undefined)).toBe('INTER_STATE');
    expect(supplyTypeFor('  ', '  ')).toBe('INTER_STATE');
  });

  it('lets export and exempt override the comparison', () => {
    expect(supplyTypeFor('29', '29', { export: true })).toBe('EXPORT');
    expect(supplyTypeFor('29', '29', { exempt: true })).toBe('EXEMPT');
  });
});

describe('inclusive pricing gives back exactly the entered price', () => {
  const inclusiveTotal = (price: number, rate: number) => {
    const result = calculateInvoice({
      lines: [line({ unitPrice: d(price), taxRate: d(rate) })],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'INCLUSIVE',
    });
    const row = result.lines[0]!;
    return row.taxableValue.plus(row.cgstAmount).plus(row.sgstAmount);
  };

  it('holds for every whole rupee from 1 to 3000 at 18%', () => {
    // Rounding `net / (1 + r)` and `taxableValue × r` independently missed by a paisa on 457 of
    // these — ₹100 came to 100.01. Deriving the tax as the remainder makes it exact by
    // construction, which is the whole promise of an inclusive price.
    const wrong: number[] = [];
    for (let price = 1; price <= 3000; price += 1) {
      if (!inclusiveTotal(price, 18).equals(d(price))) {
        wrong.push(price);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('holds at the other GST rates too', () => {
    for (const rate of [0, 5, 12, 28]) {
      for (const price of [1, 2, 41, 100, 999, 1234]) {
        expect(inclusiveTotal(price, rate).toFixed(2)).toBe(d(price).toFixed(2));
      }
    }
  });

  it('still splits CGST and SGST back to the tax exactly', () => {
    const result = calculateInvoice({
      lines: [line({ unitPrice: d(100), taxRate: d(18) })],
      supplyType: 'INTRA_STATE',
      taxTreatment: 'INCLUSIVE',
    });
    const row = result.lines[0]!;
    expect(row.cgstAmount.plus(row.sgstAmount).toFixed(2)).toBe(
      d(100).minus(row.taxableValue).toFixed(2),
    );
  });
});

describe('an untaxed supply charges nothing', () => {
  for (const supplyType of ['EXPORT', 'EXEMPT'] as const) {
    it(`charges no GST on an ${supplyType} line`, () => {
      const result = calculateInvoice({
        lines: [line({ taxRate: d(18) })],
        supplyType,
        taxTreatment: 'EXCLUSIVE',
      });
      expect(result.taxTotal.toFixed(2)).toBe('0.00');
      // The rate is kept on the row and shown as 0% on the document — see the next block for why
      // those have to be different things.
      expect(result.lines[0]!.taxRate.toFixed(2)).toBe('18.00');
    });
  }
});

describe('an untaxed supply keeps the rate it was quoted at', () => {
  it('stores the entered rate so a later edit can re-apply it', () => {
    // Storing the *effective* rate here zeroed the column that `toLineDto` reads back as input, so
    // a PATCH that merely cleared `isExport` recomputed an 18% supply at 0% and silently dropped
    // the GST. The document shows 0%; the row remembers 18.
    const result = calculateInvoice({
      lines: [line({ taxRate: d(18) })],
      supplyType: 'EXPORT',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(result.lines[0]!.taxRate.toFixed(2)).toBe('18.00');
    expect(result.taxTotal.toFixed(2)).toBe('0.00');
    expect(result.lines[0]!.cgstAmount.toFixed(2)).toBe('0.00');
    expect(result.lines[0]!.igstAmount.toFixed(2)).toBe('0.00');
  });

  it('converts back to a domestic supply at the original rate', () => {
    const exported = calculateInvoice({
      lines: [line({ taxRate: d(18) })],
      supplyType: 'EXPORT',
      taxTreatment: 'EXCLUSIVE',
    });
    // What a PATCH does: feed the stored line back in with a domestic supply type.
    const domestic = calculateInvoice({
      lines: [
        line({
          quantity: exported.lines[0]!.quantity,
          unitPrice: exported.lines[0]!.unitPrice,
          taxRate: exported.lines[0]!.taxRate,
        }),
      ],
      supplyType: 'INTER_STATE',
      taxTreatment: 'EXCLUSIVE',
    });
    expect(domestic.taxTotal.toFixed(2)).toBe('180.00');
  });
});
