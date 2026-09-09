import { INVOICE_STATUS_LABELS, type PortalInvoiceDetail } from '@ashniva/types';
import { RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Card, Divider, Pill, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
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

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Card>
          <AppText size="lg" weight="bold">
            {invoice.numberLabel}
          </AppText>
          <AppText size="xs" tone="faint">
            Issued {invoice.issueDate} · due {invoice.dueDate}
          </AppText>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Pill
              label={INVOICE_STATUS_LABELS[invoice.status]}
              tone={invoiceTone(invoice.status)}
            />
            {invoice.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
            {invoice.reverseCharge ? <Pill label="Reverse charge" tone="warning" /> : null}
          </View>
        </Card>

        <Card>
          <AppText size="sm" tone="muted" weight="medium">
            Lines ({invoice.lineItems.length})
          </AppText>
          {invoice.lineItems.map((line) => (
            <View key={line.id} style={{ gap: theme.spacing.xs }}>
              <Divider />
              <AppText size="sm">{line.description}</AppText>
              <AppText size="xs" tone="faint">
                {line.quantity} {line.unit} × {line.unitPrice} · {line.taxRate}% GST
              </AppText>
              <AppText weight="medium">{line.lineTotal}</AppText>
            </View>
          ))}
        </Card>

        <Card>
          {rows.map(([label, value]) => (
            <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText size="sm" tone="muted">
                {label}
              </AppText>
              <AppText size="sm">{value}</AppText>
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <AppText weight="bold">Total</AppText>
            <AppText weight="bold">
              {invoice.currency} {invoice.total}
            </AppText>
          </View>
          {isZero(invoice.amountPaid) ? null : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText size="sm" tone="muted">
                  Paid
                </AppText>
                <AppText size="sm">{invoice.amountPaid}</AppText>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <AppText weight="bold">Balance due</AppText>
                <AppText weight="bold">{invoice.balanceDue}</AppText>
              </View>
            </>
          )}
          {invoice.amountInWords ? (
            <AppText size="xs" tone="faint">
              {invoice.amountInWords}
            </AppText>
          ) : null}
        </Card>

        {invoice.notes ? (
          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Notes
            </AppText>
            <AppText size="sm">{invoice.notes}</AppText>
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

/** A string comparison, deliberately: parsing to compare would defeat the point. */
function isZero(value: string): boolean {
  return value === '0.00' || value === '-0.00';
}
