import PDFDocument from 'pdfkit';

import {
  MARGIN,
  TOTALS_LABEL_WIDTH,
  TOTALS_VALUE_WIDTH,
  TOTALS_WIDTH,
  renderInvoiceDocument,
  type SnapshotShape,
  type Supplier,
} from './invoice-pdf-layout';
import { Decimal } from './money';
import type { InvoiceDetailRow } from './billing.repository';

/**
 * What the document says, without producing a PDF.
 *
 * The layout is plain functions over a pdfkit document, so a recorder standing in for that
 * document is enough to assert what is printed — and unlike parsing a compressed content stream,
 * it says which string landed where. The rate is the reason this file exists: an export line
 * keeps the rate it was quoted at in the database, and the document must still say 0%.
 */

const D = (value: string) => new Decimal(value);

/** Records every `text()` call; every other pdfkit method is a no-op that keeps the chain. */
function recorder() {
  const printed: string[] = [];
  const boxes: { text: string; x: number; width: number }[] = [];
  const doc = {
    y: 0,
    text(value: string, x?: number, _y?: number, options?: { width?: number }) {
      printed.push(value);
      if (typeof x === 'number' && typeof options?.width === 'number') {
        boxes.push({ text: value, x, width: options.width });
      }
      return doc;
    },
    font: () => doc,
    fontSize: () => doc,
    fillColor: () => doc,
    moveDown: () => doc,
    moveUp: () => doc,
    moveTo: () => doc,
    lineTo: () => doc,
    strokeColor: () => doc,
    stroke: () => doc,
  };
  return { doc, printed, boxes };
}

const supplier: Supplier = {
  legalName: 'Ashniva Technologies Private Limited',
  address: '4th Floor, Tech Park, Bengaluru 560001',
  stateCode: '29',
  gstin: '29AABCU9603R1ZM',
  pan: 'AABCU9603R',
  email: 'billing@ashniva.example',
  phone: null,
  bankDetails: null,
  terms: null,
};

function invoiceRow(supplyType: string, taxed: boolean): InvoiceDetailRow {
  const tax = taxed ? '18000.00' : '0.00';
  const total = taxed ? '118000.00' : '100000.00';
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
    supplyType,
    taxTreatment: 'EXCLUSIVE',
    reverseCharge: false,
    subtotal: D('100000.00'),
    discountTotal: D('0.00'),
    taxableValue: D('100000.00'),
    cgstTotal: D('0.00'),
    sgstTotal: D('0.00'),
    igstTotal: D(tax),
    taxTotal: D(tax),
    roundingAdjustment: D('0.00'),
    total: D(total),
    amountPaid: D('0.00'),
    balanceDue: D(total),
    amountInWords: 'Rupees One Lakh Only',
    notes: null,
    internalNotes: 'Never printed',
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
    lineItems: [
      {
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
        // Stored as entered, whatever the supply type. That is the point.
        taxRate: D('18.00'),
        taxableValue: D('100000.00'),
        cgstAmount: D('0.00'),
        sgstAmount: D('0.00'),
        igstAmount: D(tax),
        lineTotal: D(total),
        source: 'MANUAL',
        sourceRefId: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ],
    taxBreakdown: [
      {
        id: 'tax-1',
        invoiceId: 'inv-1',
        taxRate: D('18.00'),
        hsnSac: '998314',
        taxableValue: D('100000.00'),
        cgstAmount: D('0.00'),
        sgstAmount: D('0.00'),
        igstAmount: D(tax),
        totalTax: D(tax),
      },
    ],
    allocations: [],
    history: [],
  } as InvoiceDetailRow;
}

function renderRow(row: InvoiceDetailRow, snapshot: SnapshotShape | null = null) {
  const { doc, printed, boxes } = recorder();
  renderInvoiceDocument(doc as unknown as PDFKit.PDFDocument, row, supplier, snapshot);
  return { printed, boxes };
}

function render(supplyType: string, taxed: boolean): string[] {
  return renderRow(invoiceRow(supplyType, taxed)).printed;
}

describe('the rate printed on the document', () => {
  for (const supplyType of ['EXPORT', 'EXEMPT'] as const) {
    it(`prints 0% on an ${supplyType} invoice whose line stores 18.00`, () => {
      const printed = render(supplyType, false);
      expect(printed).toContain('0%');
      expect(printed).not.toContain('18%');
      // And in the tax summary, which is a second call site of the same rule.
      expect(printed.some((value) => value.startsWith('0%   ·   HSN 998314'))).toBe(true);
    });
  }

  it('prints 18% on an inter-state invoice', () => {
    const printed = render('INTER_STATE', true);
    expect(printed).toContain('18%');
    expect(printed.some((value) => value.startsWith('18%   ·   HSN 998314'))).toBe(true);
  });

  it('never prints the internal notes', () => {
    expect(render('INTER_STATE', true)).not.toContain('Never printed');
  });
});

/**
 * The line table's geometry.
 *
 * Widths are asserted against the real pdfkit text metrics rather than eyeballed, because a
 * column that is too narrow does not truncate — pdfkit wraps, `drawRow` grows the row to the
 * tallest cell, and a money figure ends up split across two lines on a tax document. That is
 * what `Amount` at 40pt did from ₹10,00,000.00 upward.
 */
describe('the line table geometry', () => {
  const CONTENT_WIDTH = 595.28 - MARGIN * 2;

  /** The header row: the first nine boxes drawn at the left margin onwards. */
  function headerBoxes() {
    const { boxes } = renderRow(invoiceRow('INTER_STATE', true));
    const start = boxes.findIndex((box) => box.text === '#' && box.x === MARGIN);
    expect(start).toBeGreaterThanOrEqual(0);
    return boxes.slice(start, start + 9);
  }

  it('lays nine columns edge to edge inside the content width', () => {
    const header = headerBoxes();
    expect(header.map((box) => box.text)).toEqual([
      '#',
      'Description',
      'HSN/SAC',
      'Qty',
      'Rate',
      'Discount',
      'Taxable',
      'Tax',
      'Amount',
    ]);

    // No gaps and no overlaps: each column starts where the previous one ended.
    let x = MARGIN;
    for (const box of header) {
      expect(box.x).toBe(x);
      x += box.width;
    }
    expect(x - MARGIN).toBeLessThanOrEqual(CONTENT_WIDTH);
  });

  it('gives every column room for the widest value it can hold', () => {
    // Measured with pdfkit's own metrics at the fonts the table is drawn in. The numbers are the
    // widest string each column can be asked to render, not a guess at a typical one.
    const widest: Record<string, string> = {
      '#': '99',
      'HSN/SAC': '998314',
      Qty: '1000.000 Nos',
      Rate: '1234.5678',
      Discount: '12500.00',
      // The largest a Decimal(14,2) column holds. These two can never wrap.
      Taxable: '999999999999.99',
      Amount: '999999999999.99',
      Tax: '28.5%',
    };

    const measure = new PDFDocument({ size: 'A4', margin: MARGIN });
    for (const box of headerBoxes()) {
      measure.font('Helvetica-Bold').fontSize(8);
      const header = measure.widthOfString(box.text);
      measure.font('Helvetica').fontSize(8);
      const sample = widest[box.text];
      const value = sample ? measure.widthOfString(sample) : 0;
      expect({ column: box.text, fits: box.width >= Math.max(header, value) }).toEqual({
        column: box.text,
        fits: true,
      });
    }
  });

  it('fits a ten-lakh amount on one line', () => {
    // The exact figure the old 40pt column broke on: "999999.99" is 37.81pt and fitted,
    // "1000000.00" is 42.26pt and wrapped to a second line.
    const measure = new PDFDocument({ size: 'A4', margin: MARGIN });
    measure.font('Helvetica').fontSize(8);

    const amount = headerBoxes().find((box) => box.text === 'Amount');
    const width = amount?.width ?? 0;
    for (const figure of ['999999.99', '1000000.00', '10000000.00', '999999999999.99']) {
      // Against the height the same string takes with room to spare, so the assertion is "it did
      // not wrap" rather than a hard-coded line height.
      const oneLine = measure.heightOfString(figure, { width: 500 });
      expect({ figure, height: measure.heightOfString(figure, { width }) }).toEqual({
        figure,
        height: oneLine,
      });
    }
  });
});

describe('the discount column', () => {
  /** A line discounted by both a percentage and a flat amount, as the calculator allows. */
  function discounted(): InvoiceDetailRow {
    const row = invoiceRow('INTER_STATE', true);
    const line = row.lineItems[0];
    if (!line) {
      throw new Error('fixture');
    }
    // 10% of 100000 = 10000, plus 2500 flat = 12500 off; taxable 87500.
    line.discountPercent = D('10.00');
    line.discountAmount = D('2500.00');
    line.taxableValue = D('87500.00');
    line.igstAmount = D('15750.00');
    line.lineTotal = D('103250.00');
    return row;
  }

  it('prints the discount the calculator actually applied', () => {
    // Neither stored column holds it: `discount_percent` and `discount_amount` keep the two
    // inputs, so the figure that explains the gap between 1 × 100000.00 and 87500.00 has to be
    // worked out — and it is worked out by the same function the calculator uses.
    expect(renderRow(discounted()).printed).toContain('12500.00');
  });

  it('reconciles quantity times rate against the taxable value', () => {
    const printed = renderRow(discounted()).printed;
    const gross = 1 * 100000;
    const discount = Number(printed.find((value) => value === '12500.00'));
    expect(gross - discount).toBe(87500);
    expect(printed).toContain('87500.00');
  });

  it('prints an em dash where there was no discount', () => {
    const { boxes } = renderRow(invoiceRow('INTER_STATE', true));
    const header = boxes.findIndex((box) => box.text === '#' && box.x === MARGIN);
    // The line row follows the nine header cells; its discount cell is the sixth.
    const discountCell = boxes[header + 9 + 5];
    expect(discountCell?.text).toBe('—');
  });
});

describe('the tax summary on an export invoice', () => {
  /** Two lines quoted at different rates against the same HSN. */
  function twoRates(): InvoiceDetailRow {
    const row = invoiceRow('EXPORT', false);
    const first = row.taxBreakdown[0];
    if (!first) {
      throw new Error('fixture');
    }
    row.taxBreakdown = [
      first,
      { ...first, id: 'tax-2', taxRate: D('5.00'), taxableValue: D('40000.00') },
    ];
    return row;
  }

  it('merges rows that present at the same rate, preserving the taxable total', () => {
    const printed = renderRow(twoRates()).printed;
    const summary = printed.filter((value) => value.startsWith('0%   ·   HSN 998314'));
    expect(summary).toHaveLength(1);
    // 100000.00 + 40000.00, summed rather than shown as two rows a reader cannot tell apart.
    expect(summary[0]).toContain('taxable 140000.00');
  });

  it('keeps the rows separate on a taxable supply', () => {
    const row = twoRates();
    row.supplyType = 'INTER_STATE';
    const printed = renderRow(row).printed;
    expect(printed.filter((value) => value.includes('HSN 998314'))).toHaveLength(2);
  });
});

/**
 * Issue #9: the Total row used to wrap above about Rs 10 crore.
 *
 * Measured with pdfkit's own metrics rather than eyeballed, because that is how the defect was
 * found and it is the only way to know the box holds the widest value the column type allows.
 * `Decimal(14,2)` permits 999999999999.99 and the Total row prints the currency code beside it.
 */
describe('the totals block holds the widest value the column type allows', () => {
  const widest = 'INR 999999999999.99';

  it('fits the Total row at its own font', () => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    doc.font('Helvetica-Bold').fontSize(11);
    const width = doc.widthOfString(widest);
    doc.end();

    // 110.68pt at the time of writing, against a 90pt box before this was fixed.
    expect(width).toBeGreaterThan(90);
    expect(width).toBeLessThanOrEqual(TOTALS_VALUE_WIDTH);
  });

  it('fits every other totals row, which are drawn smaller', () => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    doc.font('Helvetica').fontSize(9);
    for (const value of ['-999999999999.99', '999999999999.99']) {
      expect(doc.widthOfString(value)).toBeLessThanOrEqual(TOTALS_VALUE_WIDTH);
    }
    doc.end();
  });

  it('still leaves room for the widest label', () => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
    doc.font('Helvetica').fontSize(9);
    for (const label of ['Subtotal', 'Discount', 'Taxable value', 'Rounding']) {
      expect(doc.widthOfString(label)).toBeLessThanOrEqual(TOTALS_LABEL_WIDTH);
    }
    doc.font('Helvetica-Bold').fontSize(11);
    expect(doc.widthOfString('Total')).toBeLessThanOrEqual(TOTALS_LABEL_WIDTH);
    doc.font('Helvetica-Bold').fontSize(9);
    expect(doc.widthOfString('Balance due')).toBeLessThanOrEqual(TOTALS_LABEL_WIDTH);
    doc.end();
  });

  it('keeps the block the same overall width, so only the split moved', () => {
    expect(TOTALS_LABEL_WIDTH + TOTALS_VALUE_WIDTH).toBe(TOTALS_WIDTH);
    expect(TOTALS_WIDTH).toBe(200);
  });
});

/**
 * The "Bill to" block.
 *
 * A GST tax invoice must identify its recipient — Rule 46 asks for their name, address and GSTIN.
 * Until the provider had somewhere to record those, the snapshot's customer block was always
 * empty and this half of the document said only the organization's display name.
 */
describe('the recipient on the document', () => {
  const customer = {
    name: 'Acme Retail Private Limited',
    address: '12 Marine Drive, Mumbai, Maharashtra, 400020, India',
    gstin: '27AABCU9603R1ZM',
    stateCode: '27',
  };

  it('prints the recorded name, address and GSTIN rather than the display name', () => {
    const printed = renderRow(invoiceRow('INTER_STATE', true), { customer }).printed;
    expect(printed).toContain('Bill to');
    expect(printed).toContain(customer.name);
    expect(printed).toContain(customer.address);
    expect(printed).toContain(`GSTIN: ${customer.gstin}`);
    // The display name on the invoice row is not what a tax invoice should carry.
    expect(printed).not.toContain('Zenith Retail');
  });

  it('names the recipient’s state code when there is no GSTIN to identify them by', () => {
    const printed = renderRow(invoiceRow('INTER_STATE', true), {
      customer: { ...customer, gstin: null },
    }).printed;
    expect(printed).toContain('State code: 27');
    // The supplier's own code is a different line and stays where it was.
    expect(printed).toContain('Supplier state code: 29');
  });

  it('falls back to the organization name for a client nobody has recorded', () => {
    // Every client is this case on the day the table ships, and the document still has to render.
    const printed = renderRow(invoiceRow('INTER_STATE', true), null).printed;
    expect(printed).toContain('Zenith Retail');
    expect(printed.some((value) => value.startsWith('GSTIN: 27'))).toBe(false);
  });
});
