import type { InvoiceDetail } from '@ashniva/types';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { AppText } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { BILLING_INVALIDATES } from './billing-api';
import { money } from './billing-display';
import { SheetActions } from './SheetActions';

/**
 * Issuing a draft. The web issues on one click; a phone asks once, because the step cannot be
 * taken back — the invoice takes the next number in the financial year and closes to editing, and
 * a mis-tap on a small screen would otherwise cost a void and a gap somebody has to explain.
 */
export function IssueInvoiceSheet({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const issue = useApiMutation<void, InvoiceDetail>({
    path: `/invoices/${invoice.id}/issue`,
    invalidate: BILLING_INVALIDATES,
    onSuccess: onDone,
  });

  return (
    <Sheet
      visible
      title="Issue this invoice"
      subtitle={`${invoice.clientName} · ${money(invoice.currency, invoice.total)}`}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Issue invoice"
          confirmIcon="send-outline"
          busy={issue.busy}
          onCancel={onClose}
          onConfirm={() => void issue.run(undefined)}
        />
      }
    >
      <AppText size="sm" tone="muted">
        It takes the next invoice number, its PDF is generated, and it can no longer be edited —
        only voided. The client can see it in their portal from then on.
      </AppText>
      {issue.error ? (
        <Banner tone="danger" role="alert">
          {issue.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
