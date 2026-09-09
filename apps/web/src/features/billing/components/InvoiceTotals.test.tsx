import type { InvoiceTaxRow } from '@ashniva/types';
import { render, screen } from '@testing-library/react';

import { InvoiceTotals } from './InvoiceTotals';

/**
 * The tax summary as a client reads it.
 *
 * The API reports the rate as *applied*, so on an export invoice every row comes back at 0.00 —
 * including two rows that were quoted at different rates. This block has to print that honestly
 * and keep both rows, which is why the list is no longer keyed by rate and HSN.
 */

const totals = {
  subtotal: '150000.00',
  discountTotal: '0.00',
  taxableValue: '150000.00',
  cgstTotal: '0.00',
  sgstTotal: '0.00',
  igstTotal: '0.00',
  taxTotal: '0.00',
  roundingAdjustment: '0.00',
  total: '150000.00',
};

const taxRow = (over: Partial<InvoiceTaxRow> = {}): InvoiceTaxRow => ({
  taxRate: '0.00',
  hsnSac: '998314',
  taxableValue: '100000.00',
  cgstAmount: '0.00',
  sgstAmount: '0.00',
  igstAmount: '0.00',
  totalTax: '0.00',
  ...over,
});

describe('InvoiceTotals', () => {
  it('shows 0% on an export invoice rather than the rate it was quoted at', () => {
    render(
      <InvoiceTotals
        totals={totals}
        currency="INR"
        taxBreakdown={[taxRow(), taxRow({ taxableValue: '50000.00' })]}
      />,
    );

    // Two rows the API collapsed to the same rate and HSN. Both must still be on screen.
    expect(screen.getAllByText('0% · HSN 998314')).toHaveLength(2);
    expect(screen.getByText('100000.00')).toBeInTheDocument();
    expect(screen.getByText('50000.00')).toBeInTheDocument();
  });

  it('gives those rows distinct keys', () => {
    // React renders duplicate-keyed siblings anyway and only warns, so the rows above passing is
    // not proof the list is keyed correctly — the warning is what says so.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <InvoiceTotals
        totals={totals}
        currency="INR"
        taxBreakdown={[taxRow(), taxRow({ taxableValue: '50000.00' })]}
      />,
    );
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    warn.mockRestore();
  });

  it('shows the rate on a domestic invoice', () => {
    render(
      <InvoiceTotals
        totals={{ ...totals, cgstTotal: '9000.00', sgstTotal: '9000.00', taxTotal: '18000.00' }}
        currency="INR"
        taxBreakdown={[taxRow({ taxRate: '18.00', cgstAmount: '9000.00', totalTax: '18000.00' })]}
      />,
    );

    expect(screen.getByText('18% · HSN 998314')).toBeInTheDocument();
    expect(screen.getByText('CGST')).toBeInTheDocument();
  });

  it('hides tax rows that are zero so an export invoice has no empty CGST line', () => {
    render(<InvoiceTotals totals={totals} currency="INR" taxBreakdown={[taxRow()]} />);

    expect(screen.queryByText('CGST')).not.toBeInTheDocument();
    expect(screen.queryByText('IGST')).not.toBeInTheDocument();
    expect(screen.getByText('Taxable value')).toBeInTheDocument();
  });
});
