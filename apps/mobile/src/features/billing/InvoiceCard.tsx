import { INVOICE_STATUS_LABELS, isInvoiceEditable, type InvoiceSummary } from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import {
  invoiceDate,
  invoiceIconTone,
  invoiceTitle,
  invoiceTone,
  isZero,
  money,
  owesMoney,
} from './billing-display';

/** One invoice in the provider's list: who it is to, what it comes to, and what is still owed. */
export function InvoiceCard({
  invoice,
  onPress,
}: {
  invoice: InvoiceSummary;
  onPress: () => void;
}) {
  const draft = isInvoiceEditable(invoice.status);
  const title = invoiceTitle(invoice);
  const partlyPaid = owesMoney(invoice) && !isZero(invoice.amountPaid);

  return (
    <PressableCard
      accessibilityLabel={`${title}, ${invoice.clientName}, ${money(invoice.currency, invoice.total)}, ${INVOICE_STATUS_LABELS[invoice.status]}`}
      accessibilityHint="Opens the invoice"
      onPress={onPress}
      highlight={invoice.isOverdue}
      icon={draft ? 'document-outline' : 'receipt'}
      iconTone={invoiceIconTone(invoice.status, invoice.isOverdue)}
    >
      <AppText size="xs" tone="faint" numberOfLines={1}>
        {title} · {invoice.clientName}
      </AppText>
      <AppText variant="heading" weight="bold" tabular>
        {money(invoice.currency, invoice.total)}
      </AppText>
      <PillRow>
        <Pill label={INVOICE_STATUS_LABELS[invoice.status]} tone={invoiceTone(invoice.status)} />
        {invoice.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
      </PillRow>
      <MetaLine icon="calendar-outline" danger={invoice.isOverdue}>
        Issued {invoiceDate(invoice.issueDate)} · due {invoiceDate(invoice.dueDate)}
      </MetaLine>
      {partlyPaid ? (
        <MetaLine icon="wallet-outline">
          Outstanding {money(invoice.currency, invoice.balanceDue)}
        </MetaLine>
      ) : null}
    </PressableCard>
  );
}
