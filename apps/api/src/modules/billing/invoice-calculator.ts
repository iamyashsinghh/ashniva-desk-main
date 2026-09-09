import { Decimal, MONEY_DP, ZERO, roundingAdjustment, sum, toMoney, type Money } from './money';

/**
 * Working out what an invoice comes to.
 *
 * Pure, and the only place invoice arithmetic happens. The API never accepts a total from the
 * client: a browser that computes its own figures is a browser that can be told to compute
 * different ones, and the number on a tax document has to come from the server.
 *
 * The GST rules implemented here are the ones that decide the shape of the document — intra- vs
 * inter-state, inclusive vs exclusive, reverse charge. This prepares invoices and records the
 * tax breakdown; it is not a GST filing system and does not attempt to be.
 */

export type TaxTreatment = 'EXCLUSIVE' | 'INCLUSIVE';
export type SupplyType = 'INTRA_STATE' | 'INTER_STATE' | 'EXPORT' | 'EXEMPT';

export interface LineInput {
  description: string;
  hsnSac?: string | null;
  /** Hours, units, or 1 for a lump sum. */
  quantity: Money;
  unitPrice: Money;
  /** Applied before tax. A percentage and an amount may both be given; both are subtracted. */
  discountPercent?: Money;
  discountAmount?: Money;
  /** The full GST rate for the line, e.g. 18 for 18%. Split into halves for an intra-state sale. */
  taxRate: Money;
}

export interface CalculatedLine {
  description: string;
  hsnSac: string;
  quantity: Money;
  unitPrice: Money;
  /** Quantity times unit price, before any discount. */
  grossAmount: Money;
  discountAmount: Money;
  /** What GST is charged on. */
  taxableValue: Money;
  taxRate: Money;
  cgstAmount: Money;
  sgstAmount: Money;
  igstAmount: Money;
  /** Taxable value plus this line's tax. */
  lineTotal: Money;
}

export interface TaxBreakdownRow {
  taxRate: Money;
  hsnSac: string;
  taxableValue: Money;
  cgstAmount: Money;
  sgstAmount: Money;
  igstAmount: Money;
  totalTax: Money;
}

export interface CalculationInput {
  lines: LineInput[];
  supplyType: SupplyType;
  taxTreatment: TaxTreatment;
  /**
   * Under reverse charge the recipient pays the tax to the government, so the supplier shows the
   * tax for information but does not collect it.
   */
  reverseCharge?: boolean;
  /** Round the payable total to a whole rupee and show the difference as its own line. */
  roundTotal?: boolean;
}

export interface CalculationResult {
  lines: CalculatedLine[];
  taxBreakdown: TaxBreakdownRow[];
  /** Sum of gross line amounts, before discount. */
  subtotal: Money;
  discountTotal: Money;
  taxableValue: Money;
  cgstTotal: Money;
  sgstTotal: Money;
  igstTotal: Money;
  taxTotal: Money;
  roundingAdjustment: Money;
  /** What the customer owes. */
  total: Money;
}

const HUNDRED = new Decimal(100);
const TWO = new Decimal(2);

/**
 * Whether tax is charged at all.
 *
 * An export or an exempt supply carries no GST. Reverse charge is different: the tax exists and
 * is shown, but the supplier does not add it to what they collect.
 */
export function taxable(supplyType: SupplyType): boolean {
  return supplyType === 'INTRA_STATE' || supplyType === 'INTER_STATE';
}

/**
 * The rate that actually applied, for anything that reports a line back to a reader.
 *
 * `tax_rate` on a stored line is the rate as *entered*, because that column is also the input a
 * PATCH round-trips through (see `calculateLine`). Every reader that presents the line to a
 * person wants the rate as *applied* instead: printing "18%" beside a zero tax amount on an
 * export invoice is a contradiction on the face of a tax document.
 *
 * One function so the document, the internal API and the portal API cannot drift apart — which
 * is exactly what happened when only the PDF was taught the difference.
 */
export function appliedTaxRate(supplyType: SupplyType, rate: Money): Money {
  return taxable(supplyType) ? rate : ZERO;
}

/**
 * The tax summary as a reader should see it, grouped by the rate that applied.
 *
 * The stored rows are grouped by the rate as *entered*, which is right for storage — that is what
 * the round trip and the unique index are built on. But on an export or exempt invoice every row
 * is presented at 0%, so lines quoted at 18% and 5% against the same HSN arrive as two rows that
 * read identically and differ only in a taxable value the reader cannot account for.
 *
 * Regrouping is a merge of cells within an existing partition, so every total is preserved
 * exactly: the taxable values of the merged rows are summed, and their sum over all rows still
 * equals the invoice's own `taxableValue`. No figure is recomputed and nothing is re-rounded —
 * the inputs are already rounded to the paisa, and addition of exact decimals is exact. On a
 * taxable supply the applied rate is the entered rate, so this is a no-op there.
 */
export function appliedBreakdown<T extends TaxBreakdownRow>(
  supplyType: SupplyType,
  rows: T[],
): TaxBreakdownRow[] {
  const groups = new Map<string, TaxBreakdownRow>();

  for (const row of rows) {
    const rate = appliedTaxRate(supplyType, row.taxRate);
    const key = `${rate.toFixed(MONEY_DP)}|${row.hsnSac}`;
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, { ...row, taxRate: rate });
      continue;
    }
    existing.taxableValue = toMoney(existing.taxableValue.plus(row.taxableValue));
    existing.cgstAmount = toMoney(existing.cgstAmount.plus(row.cgstAmount));
    existing.sgstAmount = toMoney(existing.sgstAmount.plus(row.sgstAmount));
    existing.igstAmount = toMoney(existing.igstAmount.plus(row.igstAmount));
    existing.totalTax = toMoney(existing.totalTax.plus(row.totalTax));
  }

  return [...groups.values()].sort((left, right) => right.taxRate.comparedTo(left.taxRate));
}

export function calculateInvoice(input: CalculationInput): CalculationResult {
  const lines = input.lines.map((line) => calculateLine(line, input));

  const subtotal = toMoney(sum(lines.map((line) => line.grossAmount)));
  const discountTotal = toMoney(sum(lines.map((line) => line.discountAmount)));
  const taxableValue = toMoney(sum(lines.map((line) => line.taxableValue)));
  const cgstTotal = toMoney(sum(lines.map((line) => line.cgstAmount)));
  const sgstTotal = toMoney(sum(lines.map((line) => line.sgstAmount)));
  const igstTotal = toMoney(sum(lines.map((line) => line.igstAmount)));
  const taxTotal = toMoney(cgstTotal.plus(sgstTotal).plus(igstTotal));

  // Under reverse charge the customer pays the tax directly to the government, so it is on the
  // document but not in the amount due.
  const collected = input.reverseCharge ? taxableValue : taxableValue.plus(taxTotal);
  const beforeRounding = toMoney(collected);
  const adjustment = input.roundTotal ? roundingAdjustment(beforeRounding) : ZERO;

  return {
    lines,
    taxBreakdown: buildBreakdown(lines),
    subtotal,
    discountTotal,
    taxableValue,
    cgstTotal,
    sgstTotal,
    igstTotal,
    taxTotal,
    roundingAdjustment: adjustment,
    total: toMoney(beforeRounding.plus(adjustment)),
  };
}

/**
 * What a line's discount actually came to.
 *
 * A percentage and a flat amount may both be given, and both are subtracted. The stored columns
 * keep the two *inputs* rather than this total, because storing the total would not round-trip —
 * re-opening the draft would re-apply the percentage on top of a discount already containing it
 * (see `linesFor`). So anything that wants to show the discount has to work it out, and this is
 * the one place that does: the document and the calculation cannot then disagree about a figure
 * whose whole purpose is to explain the gap between quantity × rate and the taxable value.
 */
export function lineDiscount(line: {
  quantity: Money;
  unitPrice: Money;
  discountPercent?: Money | null;
  discountAmount?: Money | null;
}): Money {
  const gross = line.quantity.times(line.unitPrice);
  const percentDiscount = line.discountPercent
    ? gross.times(line.discountPercent).dividedBy(HUNDRED)
    : ZERO;
  return toMoney(percentDiscount.plus(line.discountAmount ?? ZERO));
}

function calculateLine(line: LineInput, input: CalculationInput): CalculatedLine {
  const rate = new Decimal(line.taxRate);
  const chargeable = taxable(input.supplyType);
  const effectiveRate = chargeable ? rate : ZERO;

  const gross = line.quantity.times(line.unitPrice);
  const discount = lineDiscount(line);

  // Rounded once, here, so the taxable value on the line is the figure everything downstream
  // agrees on rather than each total re-rounding a slightly different intermediate.
  const net = toMoney(gross.minus(discount));

  const inclusive = input.taxTreatment === 'INCLUSIVE';

  const taxableValue = inclusive
    ? // The entered price already contains the tax, so the taxable value is what is left after
      // removing it: net / (1 + rate/100).
      toMoney(net.dividedBy(new Decimal(1).plus(effectiveRate.dividedBy(HUNDRED))))
    : net;

  // Inclusive tax is the remainder, not a second rounded computation.
  //
  // Rounding `net / (1 + r)` and `taxableValue × r` independently lets both land the same way and
  // the pair miss the entered price by a paisa — 457 of the first 3000 whole-rupee prices at 18%,
  // e.g. ₹100 → 84.75 + 15.26 = 100.01. Taking the difference makes the identity hold by
  // construction, which is the whole promise of inclusive pricing: the customer pays the number
  // that was quoted. Exclusive pricing has no such constraint — there the tax is genuinely
  // computed from the rate and added on top.
  const tax = inclusive
    ? toMoney(net.minus(taxableValue))
    : toMoney(taxableValue.times(effectiveRate).dividedBy(HUNDRED));

  // An intra-state sale splits the rate into equal central and state halves; an inter-state sale
  // carries the whole rate as IGST. The split is of the *tax amount*, so the two halves always
  // add back to the total even when the amount has an odd number of paise.
  const half = toMoney(tax.dividedBy(TWO));
  const intraState = input.supplyType === 'INTRA_STATE';

  return {
    description: line.description,
    hsnSac: line.hsnSac?.trim() ?? '',
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    grossAmount: toMoney(gross),
    discountAmount: discount,
    taxableValue,
    // The rate as entered, not the rate applied.
    //
    // An earlier revision stored `effectiveRate` here so an export line would not print "18%"
    // beside a zero tax amount. That was a display problem solved in the wrong place: this column
    // is also the round-trip input, because `toLineDto` reads the stored line back when a PATCH
    // omits `lines`. Zeroing it meant converting an export invoice to a domestic one — a patch
    // that only clears `isExport`, or only changes the place of supply — silently dropped the GST
    // and left an 18% supply invoiced at 0%. The presentation is fixed where it is read instead:
    // every reader passes this through `appliedTaxRate`, which reports 0% when the supply carries
    // no tax. `toLineDto`, the round-trip input, deliberately does not.
    taxRate: rate,
    cgstAmount: intraState ? half : ZERO,
    // The second half takes the remainder, so CGST + SGST equals the tax exactly.
    sgstAmount: intraState ? toMoney(tax.minus(half)) : ZERO,
    igstAmount: input.supplyType === 'INTER_STATE' ? tax : ZERO,
    lineTotal: toMoney(taxableValue.plus(tax)),
  };
}

/**
 * The per-rate summary an Indian invoice carries beneath the line items.
 *
 * Grouped by rate *and* HSN/SAC, because that is the grouping a tax return expects. The key uses
 * a fixed-precision rate string so 18 and 18.00 land in the same group.
 */
function buildBreakdown(lines: CalculatedLine[]): TaxBreakdownRow[] {
  const groups = new Map<string, TaxBreakdownRow>();

  for (const line of lines) {
    const rate = line.taxRate.toFixed(MONEY_DP);
    const key = `${rate}|${line.hsnSac}`;
    const existing = groups.get(key);

    if (existing) {
      existing.taxableValue = toMoney(existing.taxableValue.plus(line.taxableValue));
      existing.cgstAmount = toMoney(existing.cgstAmount.plus(line.cgstAmount));
      existing.sgstAmount = toMoney(existing.sgstAmount.plus(line.sgstAmount));
      existing.igstAmount = toMoney(existing.igstAmount.plus(line.igstAmount));
      existing.totalTax = toMoney(
        existing.cgstAmount.plus(existing.sgstAmount).plus(existing.igstAmount),
      );
      continue;
    }

    groups.set(key, {
      taxRate: line.taxRate,
      hsnSac: line.hsnSac,
      taxableValue: line.taxableValue,
      cgstAmount: line.cgstAmount,
      sgstAmount: line.sgstAmount,
      igstAmount: line.igstAmount,
      totalTax: toMoney(line.cgstAmount.plus(line.sgstAmount).plus(line.igstAmount)),
    });
  }

  // Highest rate first, which is how these tables are conventionally read.
  return [...groups.values()].sort((left, right) => right.taxRate.comparedTo(left.taxRate));
}

/**
 * Whether the supply is within one state.
 *
 * GST is decided by where the supply is *placed*, not where the customer is registered, so this
 * compares the place of supply against the supplier's own state code. An unknown code on either
 * side is treated as inter-state: charging IGST when CGST/SGST was due is a correctable filing
 * error, whereas failing to charge the state's share is a shortfall.
 */
export function supplyTypeFor(
  supplierStateCode: string | null | undefined,
  placeOfSupplyCode: string | null | undefined,
  options: { export?: boolean; exempt?: boolean } = {},
): SupplyType {
  if (options.export) {
    return 'EXPORT';
  }
  if (options.exempt) {
    return 'EXEMPT';
  }
  const supplier = supplierStateCode?.trim();
  const place = placeOfSupplyCode?.trim();
  if (!supplier || !place) {
    return 'INTER_STATE';
  }
  return supplier === place ? 'INTRA_STATE' : 'INTER_STATE';
}
