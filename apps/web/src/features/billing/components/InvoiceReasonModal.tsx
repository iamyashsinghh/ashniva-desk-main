import { Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReauth } from '../../auth/reauth';
import { useBillingMutations } from '../api';

interface InvoiceReasonModalProps {
  invoiceId: string;
  action: 'cancel' | 'void';
  onClose: () => void;
}

/**
 * Withdrawing an invoice.
 *
 * A reason is required and recorded: withdrawing a financial document without saying why leaves
 * an auditor with a gap they will ask about.
 *
 * Voiding is irreversible and changes a document an auditor will read, so the API asks for the
 * password again; cancelling a draft nobody was sent does not, and is not prompted for.
 */
export function InvoiceReasonModal({ invoiceId, action, onClose }: InvoiceReasonModalProps) {
  const [reason, setReason] = useState('');
  const { close } = useBillingMutations(invoiceId);
  const reauth = useReauth();
  const { error, wrap } = useSubmitHandler(onClose);
  const navigate = useNavigate();

  const title = action === 'cancel' ? 'Cancel this draft' : 'Void this invoice';

  const submit = async () => {
    const headers = action === 'void' ? reauth.headers(await reauth.request()) : undefined;
    await close.mutateAsync({ action, reason: reason.trim(), headers });
    if (action === 'cancel') {
      await navigate('/invoices');
    }
  };

  return (
    <>
      <Modal
        open
        title={title}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Back</Button>
            <Button
              variant="danger"
              loading={close.isPending}
              disabled={reason.trim().length < 3}
              disabledReason="A reason is required"
              onClick={() => void wrap(submit)()}
            >
              {title}
            </Button>
          </>
        }
      >
        <p className="muted">
          {action === 'void'
            ? 'The invoice number stays in the sequence and is never reused, so the numbering has no gap to explain. You will be asked for your password.'
            : 'A draft has not been sent to anyone, so cancelling it notifies nobody.'}
        </p>
        <FormField label="Reason" required hint="Recorded on the invoice history">
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </FormField>
        {error ? <p className="form-error">{error}</p> : null}
      </Modal>
      {reauth.modal}
    </>
  );
}
