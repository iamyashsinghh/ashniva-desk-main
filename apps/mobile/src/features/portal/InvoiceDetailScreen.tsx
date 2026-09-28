import { INVOICE_STATUS_LABELS, type PortalInvoiceDetail } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { KeyValueRow, StatTile, TileGrid } from '../../shared/components/data-display';
import { Hero, Section } from '../../shared/components/layout';
import { AppText, Card, Divider, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { invoiceDate } from './invoice-dates';
import { invoiceTone } from './invoice-display';

/**
 * One invoice, as the client sees it.
 *
 * Every figure is the string the API sent, printed verbatim. The type this screen receives has no
 * field for internal notes or status history, so there is nothing here to hide.
 */
export function InvoiceDetailScreen({ invoiceId }: { invoiceId: string }) {
  const theme = useTheme();
  const query = useResource<PortalInvoiceDetail>(
    ['portal', 'invoices', invoiceId],
    `/portal/invoices/${invoiceId}`,
  );
  const invoice = query.data ?? null;
  const error = query.error;

  if (!invoice && error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(error)}
          offline={error instanceof Error && error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  if (!invoice) {
    return (
      <Screen>
        <LoadingState label="Loading the invoice" />
      </Screen>
    );
  }

  const rows: [string, string][] = [
    ['Subtotal', invoice.subtotal],
    ...(isZero(invoice.discountTotal)
      ? []
      : ([['Discount', `-${invoice.discountTotal}`]] as [string, string][])),
    ['Taxable value', invoice.taxableValue],
    ...(isZero(invoice.cgstTotal) ? [] : ([['CGST', invoice.cgstTotal]] as [string, string][])),
    ...(isZero(invoice.sgstTotal) ? [] : ([['SGST', invoice.sgstTotal]] as [string, string][])),
    ...(isZero(invoice.igstTotal) ? [] : ([['IGST', invoice.igstTotal]] as [string, string][])),
    ...(isZero(invoice.roundingAdjustment)
      ? []
      : ([['Rounding', invoice.roundingAdjustment]] as [string, string][])),
  ];

  const paid = !isZero(invoice.amountPaid);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Hero title={invoice.numberLabel}>
          <PillRow>
            <Pill
              label={INVOICE_STATUS_LABELS[invoice.status]}
              tone={invoiceTone(invoice.status)}
            />
            {invoice.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            {invoice.reverseCharge ? <Pill label="Reverse charge" tone="warning" /> : null}
          </PillRow>
          <AppText size="xs" tone="muted">
            Issued {invoiceDate(invoice.issueDate)} · due {invoiceDate(invoice.dueDate)}
          </AppText>
        </Hero>

        {/* The figure somebody opened the invoice to find, before the arithmetic behind it. */}
        <TileGrid>
          <StatTile label="Total" value={`${invoice.currency} ${invoice.total}`} />
          {paid ? (
            <StatTile
              label="Balance due"
              value={invoice.balanceDue}
              tone={invoice.isOverdue ? 'danger' : 'default'}
            />
          ) : null}
        </TileGrid>

        <Section title={`Lines (${invoice.lineItems.length})`}>
          {invoice.lineItems.map((line, index) => (
            <View key={line.id} style={{ gap: theme.spacing.sm }}>
              {index > 0 ? <Divider /> : null}
              <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText size="sm">{line.description}</AppText>
                  <AppText size="xs" tone="faint">
                    {line.quantity} {line.unit} × {line.unitPrice} · {line.taxRate}% GST
                  </AppText>
                </View>
                <AppText weight="medium" align="right" tabular>
                  {line.lineTotal}
                </AppText>
              </View>
            </View>
          ))}
        </Section>

        <Card style={{ gap: theme.spacing.xs }}>
          {rows.map(([label, value]) => (
            <KeyValueRow key={label} label={label} value={value} />
          ))}
          <Divider />
          <KeyValueRow label="Total" value={`${invoice.currency} ${invoice.total}`} emphasis />
          {paid ? (
            <>
              <KeyValueRow label="Paid" value={invoice.amountPaid} />
              <KeyValueRow label="Balance due" value={invoice.balanceDue} emphasis />
            </>
          ) : null}
          {invoice.amountInWords ? (
            <AppText size="xs" tone="muted">
              {invoice.amountInWords}
            </AppText>
          ) : null}
        </Card>

        {invoice.notes ? (
          <Section title="Notes">
            <AppText size="sm">{invoice.notes}</AppText>
          </Section>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** A string comparison, deliberately: parsing to compare would defeat the point. */
function isZero(value: string): boolean {
  return value === '0.00' || value === '-0.00';
}
