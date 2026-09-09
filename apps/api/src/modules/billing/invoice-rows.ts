/**
 * Turning a calculation into database rows.
 *
 * These are plain functions with no dependencies so that the mapping between a calculated figure
 * and the column it lands in can be read — and tested — on its own.
 */
import type { InvoiceDetailRow } from './billing.repository';
import type { calculateInvoice } from './invoice-calculator';
import { parseMoney, toMoney } from './money';

export interface LineInputDto {
  description: string;
  hsnSac?: string;
  quantity: string;
  unit?: string;
  unitPrice: string;
  discountPercent?: string;
  discountAmount?: string;
  taxRate?: string;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Maps a calculation onto the invoice's money columns. */
export function totalsFor(calculation: ReturnType<typeof calculateInvoice>) {
  return {
    subtotal: calculation.subtotal,
    discountTotal: calculation.discountTotal,
    taxableValue: calculation.taxableValue,
    cgstTotal: calculation.cgstTotal,
    sgstTotal: calculation.sgstTotal,
    igstTotal: calculation.igstTotal,
    taxTotal: calculation.taxTotal,
    roundingAdjustment: calculation.roundingAdjustment,
    total: calculation.total,
    // A new or re-costed invoice has taken no money yet; a payment updates these separately.
    amountPaid: toMoney(0),
    balanceDue: calculation.total,
  };
}

/**
 * Maps calculated lines onto rows.
 *
 * `discountPercent` and `discountAmount` store what was *entered*, not the combined figure the
 * calculator worked out. Storing the computed total would not round-trip: re-opening the draft
 * would re-apply the percentage on top of a discount that already contained it.
 */
export function linesFor(calculation: ReturnType<typeof calculateInvoice>, inputs: LineInputDto[]) {
  return calculation.lines.map((line, index) => ({
    position: index,
    description: line.description,
    hsnSac: line.hsnSac,
    quantity: line.quantity,
    unit: inputs[index]?.unit?.trim() || 'Nos',
    unitPrice: line.unitPrice,
    discountPercent: parseMoney(inputs[index]?.discountPercent),
    discountAmount: parseMoney(inputs[index]?.discountAmount),
    taxRate: line.taxRate,
    taxableValue: line.taxableValue,
    cgstAmount: line.cgstAmount,
    sgstAmount: line.sgstAmount,
    igstAmount: line.igstAmount,
    lineTotal: line.lineTotal,
  }));
}

export function breakdownFor(calculation: ReturnType<typeof calculateInvoice>) {
  return calculation.taxBreakdown.map((row) => ({
    taxRate: row.taxRate,
    hsnSac: row.hsnSac,
    taxableValue: row.taxableValue,
    cgstAmount: row.cgstAmount,
    sgstAmount: row.sgstAmount,
    igstAmount: row.igstAmount,
    totalTax: row.totalTax,
  }));
}

/** Turns a stored line back into the shape an update recalculates from. */
export function toLineDto(line: InvoiceDetailRow['lineItems'][number]): LineInputDto {
  return {
    description: line.description,
    hsnSac: line.hsnSac,
    quantity: line.quantity.toFixed(3),
    unit: line.unit,
    unitPrice: line.unitPrice.toFixed(4),
    // Both discount inputs, so re-saving an untouched draft produces identical figures.
    discountPercent: line.discountPercent.toFixed(2),
    discountAmount: line.discountAmount.toFixed(2),
    taxRate: line.taxRate.toFixed(2),
  };
}
