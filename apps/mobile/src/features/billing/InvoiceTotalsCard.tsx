import type { InvoiceTaxRow, InvoiceTotals } from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow } from '../../shared/components/data-display';
import { SectionHeader } from '../../shared/components/layout';
import { AppText, Card, Divider } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isZero, money, trimRate } from './billing-display';

type Totals = Omit<InvoiceTotals, 'amountPaid' | 'balanceDue'> &
  Partial<Pick<InvoiceTotals, 'amountPaid' | 'balanceDue'>>;

/**
 * The totals block, laid out the way an Indian invoice reads — the web's `InvoiceTotals`.
 *
 * Every figure is printed verbatim. Zero rows are hidden so an intra-state invoice does not show an
 * empty IGST line. Used for a saved invoice and for the editor's server-calculated preview alike,
 * so the two cannot be laid out differently.
 */
export function InvoiceTotalsCard({
  title = 'Totals',
  totals,
  currency,
  amountInWords,
  taxBreakdown,
}: {
  title?: string;
  totals: Totals;
  currency: string;
  amountInWords?: string | null;
  taxBreakdown?: readonly InvoiceTaxRow[];
}) {
  const theme = useTheme();
  const rows: [string, string][] = [['Subtotal', totals.subtotal]];
  if (!isZero(totals.discountTotal)) {
    rows.push(['Discount', `-${totals.discountTotal}`]);
  }
  rows.push(['Taxable value', totals.taxableValue]);
  for (const [label, value] of [
    ['CGST', totals.cgstTotal],
    ['SGST', totals.sgstTotal],
    ['IGST', totals.igstTotal],
    ['Rounding', totals.roundingAdjustment],
  ] as const) {
    if (!isZero(value)) {
      rows.push([label, value]);
    }
  }
  const paid = totals.amountPaid !== undefined && !isZero(totals.amountPaid);

  return (
    <Card style={{ gap: theme.spacing.xs }}>
      <SectionHeader title={title} icon="calculator-outline" />
      {taxBreakdown && taxBreakdown.length > 0 ? (
        <View style={{ gap: 2, paddingBottom: theme.spacing.xs }}>
          {/*
            Keyed by position: an export invoice quoted at several rates comes back as several rows
            all reading 0.00, so a key built from rate and HSN collides.
          */}
          {taxBreakdown.map((row, index) => (
            <KeyValueRow
              key={index}
              label={`GST ${trimRate(row.taxRate)}%${row.hsnSac ? ` · HSN ${row.hsnSac}` : ''} on ${row.taxableValue}`}
              value={row.totalTax}
            />
          ))}
          <Divider />
        </View>
      ) : null}
      {rows.map(([label, value]) => (
        <KeyValueRow key={label} label={label} value={value} />
      ))}
      <Divider />
      <KeyValueRow label="Total" value={money(currency, totals.total)} emphasis />
      {paid && totals.amountPaid && totals.balanceDue ? (
        <>
          <KeyValueRow label="Paid" value={totals.amountPaid} tone="success" />
          <KeyValueRow label="Balance due" value={money(currency, totals.balanceDue)} emphasis />
        </>
      ) : null}
      {amountInWords ? (
        <AppText size="xs" tone="muted">
          {amountInWords}
        </AppText>
      ) : null}
    </Card>
  );
}
