import { PAYMENT_METHOD_LABELS, type PaymentSummary } from '@ashniva/types';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/data-display';
import { IconTile } from '../../shared/components/Icon';
import { AppText, Card, Pill, PillRow } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { invoiceDate, isZero, money } from './billing-display';

/**
 * One payment received: the web table's row as a card. Money not yet applied to an invoice is
 * called out, because it is a credit somebody has to decide what to do with.
 */
export function PaymentCard({ payment }: { payment: PaymentSummary }) {
  const theme = useTheme();
  const unapplied = !isZero(payment.unallocatedAmount);
  return (
    <Card style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.md }}>
      <IconTile name="card-outline" tone={unapplied ? 'warning' : 'success'} size={40} />
      <View
        accessible
        accessibilityLabel={`${payment.reference}, ${payment.clientName}, ${money(payment.currency, payment.amount)}`}
        style={{ flex: 1, gap: theme.spacing.xs }}
      >
        <AppText variant="label" tone="muted" uppercase numberOfLines={1}>
          {payment.reference} · {payment.clientName}
        </AppText>
        <AppText variant="heading" tabular>
          {money(payment.currency, payment.amount)}
        </AppText>
        {unapplied ? (
          <PillRow>
            <Pill label={`${payment.unallocatedAmount} unapplied`} tone="warning" />
          </PillRow>
        ) : null}
        <MetaLine icon="calendar-outline">
          {PAYMENT_METHOD_LABELS[payment.method]} · received {invoiceDate(payment.paidAt)}
        </MetaLine>
        <MetaLine icon="person-outline">Recorded by {payment.recordedByName}</MetaLine>
        {payment.notes ? (
          <AppText size="sm" tone="muted">
            {payment.notes}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}
