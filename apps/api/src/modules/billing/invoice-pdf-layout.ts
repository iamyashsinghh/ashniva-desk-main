/**
 * How an invoice is laid out on the page.
 *
 * Separated from the service so that the drawing is plain functions over a pdfkit document: no
 * database, no storage, nothing to stub in order to check that a figure lands where it should.
 * Every value printed here comes from the invoice row or the supplier snapshot — the layout does
 * no arithmetic of its own, because the totals on a tax document must have exactly one source.
 */
import type { InvoiceDetailRow } from './billing.repository';
import {
  day,
  statusLabel,
  supplyLabel,
  trimZeros,
  type SnapshotShape,
  type Supplier,
} from './invoice-pdf-supplier';
import {
  appliedBreakdown,
  appliedTaxRate,
  lineDiscount,
  type SupplyType,
} from './invoice-calculator';
import { amountInWords, unitPriceText, type Money } from './money';

/** Page geometry, in points. A4 at pdfkit's default 72dpi. */
export const MARGIN = 40;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export { profileAsSupplier } from './invoice-pdf-supplier';
export type { SnapshotShape, Supplier } from './invoice-pdf-supplier';

/** Draws the whole document, top to bottom. */
export function renderInvoiceDocument(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceDetailRow,
  supplier: Supplier,
  snapshot: SnapshotShape | null,
): void {
  drawHeader(doc, invoice, supplier);
  drawParties(doc, invoice, supplier, snapshot);
  drawLines(doc, invoice);
  drawTaxBreakdown(doc, invoice);
  drawTotals(doc, invoice);
  drawFooter(doc, invoice, supplier);
}

function drawHeader(doc: PDFKit.PDFDocument, invoice: InvoiceDetailRow, supplier: Supplier): void {
  doc
    .fontSize(18)
    .font('Helvetica-Bold')
    .text(supplier.legalName || 'Tax Invoice', MARGIN, MARGIN);
  doc.fontSize(9).font('Helvetica').fillColor('#444444');
  if (supplier.address) {
    doc.text(supplier.address, { width: CONTENT_WIDTH * 0.6 });
  }
  const identity = [
    supplier.gstin ? `GSTIN: ${supplier.gstin}` : null,
    supplier.pan ? `PAN: ${supplier.pan}` : null,
    supplier.email,
    supplier.phone,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (identity) {
    doc.text(identity, { width: CONTENT_WIDTH * 0.6 });
  }

  doc.fillColor('#000000').fontSize(16).font('Helvetica-Bold');
  doc.text('TAX INVOICE', MARGIN, MARGIN, { width: CONTENT_WIDTH, align: 'right' });
  doc.fontSize(10).font('Helvetica');
  doc.text(invoice.numberLabel, { width: CONTENT_WIDTH, align: 'right' });
  doc.fontSize(9).fillColor('#444444');
  doc.text(`Issued ${day(invoice.issueDate)}   Due ${day(invoice.dueDate)}`, {
    width: CONTENT_WIDTH,
    align: 'right',
  });
  // Stated on the face of the document, because it changes who pays the tax.
  if (invoice.reverseCharge) {
    doc.text('Reverse charge applicable', { width: CONTENT_WIDTH, align: 'right' });
  }
  doc.fillColor('#000000').moveDown(1.5);
}

function drawParties(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceDetailRow,
  supplier: Supplier,
  snapshot: SnapshotShape | null,
): void {
  const top = doc.y + 8;
  doc.fontSize(9).font('Helvetica-Bold').text('Bill to', MARGIN, top);
  doc.font('Helvetica').fontSize(9);
  doc.text(snapshot?.customer?.name ?? invoice.clientOrganization.name, {
    width: CONTENT_WIDTH / 2 - 10,
  });
  if (snapshot?.customer?.address) {
    doc.text(snapshot.customer.address, { width: CONTENT_WIDTH / 2 - 10 });
  }
  if (snapshot?.customer?.gstin) {
    doc.text(`GSTIN: ${snapshot.customer.gstin}`);
  } else if (snapshot?.customer?.stateCode) {
    // Rule 46 asks for the recipient's state and its code where there is no GSTIN to identify
    // them by. Where there is one, the code is its first two characters already.
    doc.text(`State code: ${snapshot.customer.stateCode}`);
  }

  const rightX = MARGIN + CONTENT_WIDTH / 2;
  doc.font('Helvetica-Bold').text('Place of supply', rightX, top);
  doc
    .font('Helvetica')
    .text(`${invoice.placeOfSupplyState} (${invoice.placeOfSupplyCode})`, rightX, doc.y);
  doc.text(`Supply: ${supplyLabel(invoice.supplyType)}`, rightX, doc.y);
  if (supplier.stateCode) {
    doc.text(`Supplier state code: ${supplier.stateCode}`, rightX, doc.y);
  }
  doc.moveDown(1.5);
}

function drawLines(doc: PDFKit.PDFDocument, invoice: InvoiceDetailRow): void {
  // Widths measured against Helvetica 8 with pdfkit's own `widthOfString`, not estimated. They
  // sum to 515 of the 515.28pt of content width.
  //
  // A column too narrow does not truncate — pdfkit wraps, so the figure breaks across two lines
  // and `drawRow` grows the whole row to match. `Amount` at 40pt did exactly that from
  // ₹10,00,000.00 upward ("1000000.00" needs 42.26pt), putting a two-line total on the invoice.
  // Taxable and Amount are now 66pt, which clears "999999999999.99" (64.5pt) — the largest value
  // a Decimal(14,2) column can hold — so neither can wrap at all. Description is the only column
  // meant to wrap, so it absorbs the space the new Discount column costs.
  const columns = [
    { label: '#', width: 16, align: 'left' as const },
    { label: 'Description', width: 137, align: 'left' as const },
    { label: 'HSN/SAC', width: 40, align: 'left' as const },
    { label: 'Qty', width: 56, align: 'right' as const },
    { label: 'Rate', width: 58, align: 'right' as const },
    { label: 'Discount', width: 50, align: 'right' as const },
    { label: 'Taxable', width: 66, align: 'right' as const },
    { label: 'Tax', width: 26, align: 'right' as const },
    { label: 'Amount', width: 66, align: 'right' as const },
  ];

  let y = doc.y;
  doc.fontSize(8).font('Helvetica-Bold');
  drawRow(
    doc,
    columns,
    columns.map((column) => column.label),
    y,
  );
  y = doc.y + 4;
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .strokeColor('#cccccc')
    .stroke();
  y += 6;

  doc.font('Helvetica').fontSize(8);
  for (const [index, line] of invoice.lineItems.entries()) {
    // A long description wraps, so the next row starts from where this one actually ended.
    drawRow(
      doc,
      columns,
      [
        String(index + 1),
        line.description,
        line.hsnSac || '—',
        `${trimZeros(line.quantity.toFixed(3))} ${line.unit}`,
        unitPriceText(line.unitPrice),
        // A prescribed particular on a GST invoice, and until now the missing one. A discounted
        // line printed quantity × rate beside a smaller taxable value with nothing to account for
        // the gap, so the document did not add up on its own face.
        discountPrinted(line),
        line.taxableValue.toFixed(2),
        ratePrinted(invoice.supplyType, line.taxRate),
        line.lineTotal.toFixed(2),
      ],
      y,
    );
    y = doc.y + 6;
  }

  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .strokeColor('#cccccc')
    .stroke();
  doc.y = y + 8;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  columns: { width: number; align: 'left' | 'right' }[],
  values: string[],
  y: number,
): void {
  let x = MARGIN;
  let lowest = y;
  for (const [index, column] of columns.entries()) {
    doc.text(values[index] ?? '', x, y, { width: column.width, align: column.align });
    lowest = Math.max(lowest, doc.y);
    x += column.width;
  }
  doc.y = lowest;
}

function drawTaxBreakdown(doc: PDFKit.PDFDocument, invoice: InvoiceDetailRow): void {
  if (invoice.taxBreakdown.length === 0) {
    return;
  }
  doc
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('Tax summary', MARGIN, doc.y + 4);
  doc.font('Helvetica').fontSize(8);
  // Grouped by the rate that applied, so an export invoice quoted at several rates does not print
  // a stack of rows all reading 0% against the same HSN. The same view the API reports.
  for (const row of appliedBreakdown(invoice.supplyType as SupplyType, invoice.taxBreakdown)) {
    const parts = [
      ratePrinted(invoice.supplyType, row.taxRate),
      row.hsnSac ? `HSN ${row.hsnSac}` : null,
      `taxable ${row.taxableValue.toFixed(2)}`,
      row.cgstAmount.isZero() ? null : `CGST ${row.cgstAmount.toFixed(2)}`,
      row.sgstAmount.isZero() ? null : `SGST ${row.sgstAmount.toFixed(2)}`,
      row.igstAmount.isZero() ? null : `IGST ${row.igstAmount.toFixed(2)}`,
    ].filter(Boolean);
    doc.text(parts.join('   ·   '), MARGIN, doc.y);
  }
  doc.moveDown(0.5);
}

/**
 * The totals block, split so the money column can hold the widest value the column type allows.
 *
 * `Decimal(14,2)` permits 999999999999.99, and the Total row prints the currency code beside it at
 * Helvetica-Bold 11 — `INR 999999999999.99`, which pdfkit measures at 110.68pt. The value box used
 * to be 90pt, so anything from about Rs 10 crore upward wrapped onto a second line, the same
 * failure the Amount column had before it was widened.
 *
 * The 200pt block is unchanged; the split moved. The widest label is "Taxable value" at 54.54pt,
 * so 70pt leaves the label room to spare and hands the rest to the number.
 */
export const TOTALS_WIDTH = 200;
export const TOTALS_LABEL_WIDTH = 70;
export const TOTALS_VALUE_WIDTH = TOTALS_WIDTH - TOTALS_LABEL_WIDTH;

function drawTotals(doc: PDFKit.PDFDocument, invoice: InvoiceDetailRow): void {
  const rows: [string, string][] = [
    ['Subtotal', invoice.subtotal.toFixed(2)],
    ...(invoice.discountTotal.isZero()
      ? []
      : ([['Discount', `-${invoice.discountTotal.toFixed(2)}`]] as [string, string][])),
    ['Taxable value', invoice.taxableValue.toFixed(2)],
    ...(invoice.cgstTotal.isZero()
      ? []
      : ([['CGST', invoice.cgstTotal.toFixed(2)]] as [string, string][])),
    ...(invoice.sgstTotal.isZero()
      ? []
      : ([['SGST', invoice.sgstTotal.toFixed(2)]] as [string, string][])),
    ...(invoice.igstTotal.isZero()
      ? []
      : ([['IGST', invoice.igstTotal.toFixed(2)]] as [string, string][])),
    ...(invoice.roundingAdjustment.isZero()
      ? []
      : ([['Rounding', invoice.roundingAdjustment.toFixed(2)]] as [string, string][])),
  ];

  const labelX = MARGIN + CONTENT_WIDTH - TOTALS_WIDTH;
  doc.fontSize(9).font('Helvetica');
  for (const [label, value] of rows) {
    doc.text(label, labelX, doc.y, { width: TOTALS_LABEL_WIDTH, align: 'left' });
    doc.moveUp();
    doc.text(value, labelX + TOTALS_LABEL_WIDTH, doc.y, {
      width: TOTALS_VALUE_WIDTH,
      align: 'right',
    });
  }

  doc.font('Helvetica-Bold').fontSize(11);
  doc.text('Total', labelX, doc.y + 4, { width: TOTALS_LABEL_WIDTH, align: 'left' });
  doc.moveUp();
  doc.text(`${invoice.currency} ${invoice.total.toFixed(2)}`, labelX + TOTALS_LABEL_WIDTH, doc.y, {
    width: TOTALS_VALUE_WIDTH,
    align: 'right',
  });

  if (!invoice.amountPaid.isZero()) {
    doc.font('Helvetica').fontSize(9);
    doc.text('Paid', labelX, doc.y + 2, { width: TOTALS_LABEL_WIDTH });
    doc.moveUp();
    doc.text(invoice.amountPaid.toFixed(2), labelX + TOTALS_LABEL_WIDTH, doc.y, {
      width: TOTALS_VALUE_WIDTH,
      align: 'right',
    });
    doc.font('Helvetica-Bold');
    doc.text('Balance due', labelX, doc.y, { width: TOTALS_LABEL_WIDTH });
    doc.moveUp();
    doc.text(invoice.balanceDue.toFixed(2), labelX + TOTALS_LABEL_WIDTH, doc.y, {
      width: TOTALS_VALUE_WIDTH,
      align: 'right',
    });
  }

  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#333333');
  doc.text(invoice.amountInWords ?? amountInWords(invoice.total), MARGIN, doc.y + 10, {
    width: CONTENT_WIDTH * 0.6,
  });
  doc.fillColor('#000000').moveDown(1);
}

function drawFooter(doc: PDFKit.PDFDocument, invoice: InvoiceDetailRow, supplier: Supplier): void {
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .text(`Status: ${statusLabel(invoice.status)}`, MARGIN);
  doc.font('Helvetica').fontSize(8).fillColor('#444444');

  if (supplier.bankDetails) {
    doc.moveDown(0.5).font('Helvetica-Bold').fillColor('#000000').text('Payment details');
    doc
      .font('Helvetica')
      .fillColor('#444444')
      .text(supplier.bankDetails, {
        width: CONTENT_WIDTH * 0.6,
      });
  }
  // The client-facing note only. `internalNotes` is deliberately never rendered.
  if (invoice.notes) {
    doc.moveDown(0.5).font('Helvetica-Bold').fillColor('#000000').text('Notes');
    doc
      .font('Helvetica')
      .fillColor('#444444')
      .text(invoice.notes, {
        width: CONTENT_WIDTH * 0.6,
      });
  }
  if (supplier.terms) {
    doc.moveDown(0.5).font('Helvetica-Bold').fillColor('#000000').text('Terms');
    doc
      .font('Helvetica')
      .fillColor('#444444')
      .text(supplier.terms, {
        width: CONTENT_WIDTH * 0.6,
      });
  }

  const signY = Math.min(doc.y + 30, 720);
  doc.fillColor('#000000').fontSize(9);
  doc.text(`For ${supplier.legalName}`, MARGIN + CONTENT_WIDTH - 180, signY, {
    width: 180,
    align: 'right',
  });
  doc.text('', MARGIN + CONTENT_WIDTH - 180, signY + 34);
  doc
    .moveTo(MARGIN + CONTENT_WIDTH - 160, signY + 32)
    .lineTo(MARGIN + CONTENT_WIDTH, signY + 32)
    .strokeColor('#888888')
    .stroke();
  doc
    .fontSize(8)
    .fillColor('#444444')
    .text('Authorised signatory', MARGIN + CONTENT_WIDTH - 180, signY + 36, {
      width: 180,
      align: 'right',
    });
}

/**
 * The rate to print, which is not always the rate on the line.
 *
 * An export or exempt supply carries no GST, so the line keeps the rate it was quoted at — that is
 * what a later edit needs — but the document must say 0%. Printing "18%" beside a zero tax amount
 * misstates the rate applied to whoever reads the invoice, a tax authority included.
 */
/** The discount actually applied, or an em dash where there was none. */
function discountPrinted(line: InvoiceDetailRow['lineItems'][number]): string {
  const discount = lineDiscount(line);
  return discount.isZero() ? '—' : discount.toFixed(2);
}

function ratePrinted(supplyType: string, rate: Money): string {
  const applied = appliedTaxRate(supplyType as SupplyType, rate);
  return `${trimZeros(applied.toFixed(2))}%`;
}
