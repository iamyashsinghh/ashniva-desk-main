import type { InvoiceTaxRow } from '@ashniva/types';

interface Totals {
  subtotal: string;
  discountTotal: string;
  taxableValue: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  taxTotal: string;
  roundingAdjustment: string;
  total: string;
  amountPaid?: string;
  balanceDue?: string;
}

interface InvoiceTotalsProps {
  totals: Totals;
  currency: string;
  amountInWords?: string | null;
  taxBreakdown?: InvoiceTaxRow[];
}

/**
 * The totals block, laid out the way an Indian invoice reads.
 *
 * Every figure arrives as a string and is printed verbatim — never parsed into a number and
 * re-formatted, which would reintroduce the floating-point error the API went to trouble to
 * avoid. Zero rows are hidden so an intra-state invoice does not show an empty IGST line.
 */
export function InvoiceTotals({
  totals,
  currency,
  amountInWords,
  taxBreakdown,
}: InvoiceTotalsProps) {
  const rows: [string, string][] = [
    ['Subtotal', totals.subtotal],
    ...(isZero(totals.discountTotal)
      ? []
      : ([['Discount', `-${totals.discountTotal}`]] as [string, string][])),
    ['Taxable value', totals.taxableValue],
    ...(isZero(totals.cgstTotal) ? [] : ([['CGST', totals.cgstTotal]] as [string, string][])),
    ...(isZero(totals.sgstTotal) ? [] : ([['SGST', totals.sgstTotal]] as [string, string][])),
    ...(isZero(totals.igstTotal) ? [] : ([['IGST', totals.igstTotal]] as [string, string][])),
    ...(isZero(totals.roundingAdjustment)
      ? []
      : ([['Rounding', totals.roundingAdjustment]] as [string, string][])),
  ];

  return (
    <>
      {taxBreakdown && taxBreakdown.length > 0 ? (
        <ul className="billing-lines">
          {/*
            Keyed by position, not by rate and HSN. Those two are unique among *stored* breakdown
            rows, but the API reports the rate as applied — so an export invoice quoted at several
            rates comes back as several rows all reading 0.00, and a key built from them collides.
            The list is a static render of an array in a fixed order, so the index is the identity.
          */}
          {taxBreakdown.map((row, index) => (
            <li key={index} className="billing-lines__row">
              <span>
                {trim(row.taxRate)}%{row.hsnSac ? ` · HSN ${row.hsnSac}` : ''}
              </span>
              <span className="money">{row.taxableValue}</span>
              <span className="money">{row.totalTax}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="billing-totals">
        {rows.map(([label, value]) => (
          <div key={label} className="billing-totals__row">
            <span>{label}</span>
            <span className="money">{value}</span>
          </div>
        ))}
        <div className="billing-totals__row billing-totals__row--grand">
          <span>Total</span>
          <span className="money">
            {currency} {totals.total}
          </span>
        </div>
        {totals.amountPaid && !isZero(totals.amountPaid) ? (
          <>
            <div className="billing-totals__row">
              <span>Paid</span>
              <span className="money">{totals.amountPaid}</span>
            </div>
            <div className="billing-totals__row billing-totals__row--grand">
              <span>Balance due</span>
              <span className="money">{totals.balanceDue}</span>
            </div>
          </>
        ) : null}
      </div>

      {amountInWords ? <p className="billing-words">{amountInWords}</p> : null}
    </>
  );
}

/** A string comparison, deliberately: parsing to compare would defeat the point. */
function isZero(value: string): boolean {
  return value === '0.00' || value === '-0.00';
}

function trim(rate: string): string {
  return rate.replace(/\.?0+$/, '');
}
