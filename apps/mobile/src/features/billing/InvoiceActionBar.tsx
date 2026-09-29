import {
  PERMISSIONS,
  canTransitionInvoice,
  isInvoiceEditable,
  type InvoiceDetail,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { Banner } from '../../shared/components/feedback';
import { Grow, StickyActionBar } from '../../shared/components/layout';
import { Button } from '../../shared/components/primitives';
import { useSession } from '../auth/SessionProvider';
import { BILLING_INVALIDATES } from './billing-api';
import { owesMoney } from './billing-display';
import { CloseInvoiceSheet, type CloseAction } from './CloseInvoiceSheet';
import { IssueInvoiceSheet } from './IssueInvoiceSheet';
import { RecordPaymentSheet } from './RecordPaymentSheet';

type OpenSheet = 'issue' | 'pay' | CloseAction | null;

/**
 * What can be done to an invoice, pinned within thumb's reach — every action the web page has.
 *
 * Each button is gated on the permission its endpoint checks, so nobody is offered a 403: issuing
 * on `invoice:issue`, cancelling a draft on `invoice:cancel` (the web gates it on `invoice:void`,
 * which is not what the API asks for), voiding on `invoice:void`, recording a payment on
 * `payment:record`, editing and the reminder on `invoice:write`. A payment is only offered while
 * money is owed on an invoice the client has been sent; the API refuses the rest with a message
 * that reads like a bug.
 */
export function InvoiceActionBar({
  invoice,
  onEdit,
}: {
  invoice: InvoiceDetail;
  onEdit: () => void;
}) {
  const { can } = useSession();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const reminder = useApiMutation<void, InvoiceDetail>({
    path: `/invoices/${invoice.id}/reminder`,
    invalidate: BILLING_INVALIDATES,
  });

  const draft = isInvoiceEditable(invoice.status);
  const owes = owesMoney(invoice);
  const actions = {
    issue: draft && can(PERMISSIONS.INVOICE_ISSUE),
    edit: draft && can(PERMISSIONS.INVOICE_WRITE),
    pay: owes && can(PERMISSIONS.PAYMENT_RECORD),
    remind: owes && can(PERMISSIONS.INVOICE_WRITE),
    cancel: draft && can(PERMISSIONS.INVOICE_CANCEL),
    void: !draft && can(PERMISSIONS.INVOICE_VOID) && canTransitionInvoice(invoice.status, 'VOID'),
  };
  if (!Object.values(actions).some(Boolean)) {
    return null;
  }

  const close = () => setSheet(null);

  return (
    <>
      <StickyActionBar
        note={
          reminder.error ? (
            <Banner tone="danger" role="alert">
              {reminder.error}
            </Banner>
          ) : null
        }
      >
        {actions.issue ? (
          <Grow>
            <Button label="Issue invoice" icon="send-outline" onPress={() => setSheet('issue')} />
          </Grow>
        ) : null}
        {actions.pay ? (
          <Grow>
            <Button label="Record payment" icon="card-outline" onPress={() => setSheet('pay')} />
          </Grow>
        ) : null}
        {actions.edit ? (
          <Grow>
            <Button label="Edit draft" icon="create-outline" variant="secondary" onPress={onEdit} />
          </Grow>
        ) : null}
        {actions.remind ? (
          <Grow>
            <Button
              label="Mark reminder sent"
              icon="notifications-outline"
              variant="secondary"
              loading={reminder.busy}
              onPress={() => void reminder.run(undefined)}
            />
          </Grow>
        ) : null}
        {actions.cancel ? (
          <Grow>
            <Button
              label="Cancel draft"
              icon="close-circle-outline"
              variant="dangerGhost"
              onPress={() => setSheet('cancel')}
            />
          </Grow>
        ) : null}
        {actions.void ? (
          <Grow>
            <Button
              label="Void"
              icon="ban-outline"
              variant="dangerGhost"
              onPress={() => setSheet('void')}
            />
          </Grow>
        ) : null}
      </StickyActionBar>

      {sheet === 'issue' ? (
        <IssueInvoiceSheet invoice={invoice} onClose={close} onDone={close} />
      ) : null}
      {sheet === 'pay' ? (
        <RecordPaymentSheet invoice={invoice} onClose={close} onDone={close} />
      ) : null}
      {sheet === 'cancel' || sheet === 'void' ? (
        <CloseInvoiceSheet invoice={invoice} action={sheet} onClose={close} onDone={close} />
      ) : null}
    </>
  );
}
