import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SUPPLY_TYPE_LABELS,
  TAX_TREATMENT_LABELS,
  type InvoiceDetail,
} from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, MetaLine } from '../../shared/components/data-display';
import { Section } from '../../shared/components/layout';
import { AppText, Divider } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { invoiceDate } from './billing-display';

/**
 * The secondary facts about an invoice — how it is taxed, what has been received against it, and
 * what has happened to it. Payments and history fold away: they are what an accountant opens, not
 * what somebody chasing a client needs on the first screen.
 */
export function InvoiceRecordSections({ invoice }: { invoice: InvoiceDetail }) {
  const theme = useTheme();
  return (
    <>
      <Section title="Tax treatment" icon="business-outline">
        <KeyValueRow label="Supply" value={SUPPLY_TYPE_LABELS[invoice.supplyType]} />
        <KeyValueRow
          label="Place of supply"
          value={`${invoice.placeOfSupplyState} (${invoice.placeOfSupplyCode})`}
        />
        <KeyValueRow label="Pricing" value={TAX_TREATMENT_LABELS[invoice.taxTreatment]} />
        {invoice.lastReminderAt ? (
          <MetaLine icon="notifications-outline">
            Reminder sent {formatDateTime(invoice.lastReminderAt)}
          </MetaLine>
        ) : null}
      </Section>

      <Section
        title="Payments"
        count={invoice.payments.length}
        icon="card-outline"
        collapsible
        initiallyOpen={invoice.payments.length > 0}
      >
        {invoice.payments.length === 0 ? (
          <AppText size="sm" tone="muted">
            Nothing received yet.
          </AppText>
        ) : null}
        {invoice.payments.map((payment, index) => (
          <View key={payment.paymentId} style={{ gap: theme.spacing.sm }}>
            {index > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size="sm" weight="medium">
                  {payment.reference}
                </AppText>
                <AppText size="xs" tone="faint">
                  {PAYMENT_METHOD_LABELS[payment.method]} · {invoiceDate(payment.paidAt)}
                </AppText>
              </View>
              <AppText weight="medium" tone="success" align="right" tabular>
                {payment.allocatedAmount}
              </AppText>
            </View>
          </View>
        ))}
      </Section>

      <Section
        title="History"
        count={invoice.history.length}
        icon="time-outline"
        collapsible
        initiallyOpen={false}
      >
        {invoice.history.length === 0 ? (
          <AppText size="sm" tone="muted">
            Nothing has happened yet.
          </AppText>
        ) : null}
        {invoice.history.map((entry, index) => (
          <View key={entry.id} style={{ gap: 2 }}>
            {index > 0 ? <Divider /> : null}
            <AppText size="sm" weight="medium">
              {INVOICE_STATUS_LABELS[entry.toStatus]}
            </AppText>
            <AppText size="xs" tone="faint">
              {entry.changedByName} · {formatDateTime(entry.createdAt)}
            </AppText>
            {entry.note ? <AppText size="sm">{entry.note}</AppText> : null}
          </View>
        ))}
      </Section>
    </>
  );
}
