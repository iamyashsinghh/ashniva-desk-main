import type { InvoiceDetail } from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../shared/components/feedback';
import { AppText, Field, Input } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { BILLING_INVALIDATES } from './billing-api';
import { ConfirmPasswordField } from './ConfirmPasswordField';
import { useGuardedWrite } from './guarded-write';
import { SheetActions } from './SheetActions';

export type CloseAction = 'cancel' | 'void';

/** The API's own minimum; a shorter reason is refused. */
const MIN_REASON = 3;

/**
 * Withdrawing an invoice — the web's reason dialog.
 *
 * A reason is required and recorded on the history: withdrawing a financial document without
 * saying why leaves an auditor with a gap. Voiding is irreversible and changes a document an
 * auditor will read, so the API asks for the password again; cancelling a draft nobody was sent
 * does not, and is not asked for.
 */
export function CloseInvoiceSheet({
  invoice,
  action,
  onClose,
  onDone,
}: {
  invoice: InvoiceDetail;
  action: CloseAction;
  onClose: () => void;
  onDone: (action: CloseAction) => void;
}) {
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const write = useGuardedWrite<{ reason: string }, InvoiceDetail>({
    path: `/invoices/${invoice.id}/${action}`,
    body: (variables) => variables,
    invalidate: BILLING_INVALIDATES,
    onSuccess: () => onDone(action),
  });

  const voiding = action === 'void';
  const title = voiding ? 'Void this invoice' : 'Cancel this draft';
  const ready = reason.trim().length >= MIN_REASON && (!voiding || password.length > 0);

  return (
    <Sheet
      visible
      title={title}
      subtitle={voiding ? invoice.numberLabel : invoice.clientName}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel={voiding ? 'Void invoice' : 'Cancel draft'}
          confirmIcon={voiding ? 'ban-outline' : 'close-circle-outline'}
          danger
          busy={write.busy}
          disabled={!ready}
          onCancel={onClose}
          onConfirm={() => void write.run({ reason: reason.trim() }, voiding ? password : null)}
        />
      }
    >
      <AppText size="sm" tone="muted">
        {voiding
          ? 'The invoice number stays in the sequence and is never reused, so the numbering has no gap to explain. The client keeps the document.'
          : 'A draft has not been sent to anyone, so cancelling it notifies nobody.'}
      </AppText>
      <Field label="Reason" required hint="Recorded on the invoice history">
        <Input
          accessibilityLabel="Reason"
          value={reason}
          onChangeText={(value) => {
            write.reset();
            setReason(value);
          }}
          multiline
          numberOfLines={3}
          maxLength={500}
          style={{ minHeight: 88 }}
        />
      </Field>
      {voiding ? (
        <ConfirmPasswordField
          value={password}
          onChange={(value) => {
            write.reset();
            setPassword(value);
          }}
          reason="Voiding cannot be undone, so the server asks you to confirm it is you."
        />
      ) : null}
      {write.error ? (
        <Banner tone="danger" role="alert">
          {write.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
