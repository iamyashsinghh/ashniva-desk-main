import { PAYMENT_METHOD_LABELS, type InvoiceDetail, type PaymentMethod } from '@ashniva/types';
import { Button, FormField, Input, Modal, Select, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReauth } from '../../auth/reauth';
import { useBillingMutations } from '../api';

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

/**
 * Recording money received against one invoice.
 *
 * The amount defaults to the outstanding balance, which is what is usually paid. The API refuses
 * an overpayment rather than absorbing it, so a wrong figure is caught rather than hidden.
 *
 * Asserting that money arrived settles invoices against it, so the API asks for the password
 * again and the prompt is raised here before the request goes out.
 */
export function RecordPaymentModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceDetail;
  onClose: () => void;
}) {
  const { recordPayment } = useBillingMutations(invoice.id);
  const reauth = useReauth();
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    reference: '',
    method: 'BANK_TRANSFER' as PaymentMethod,
    paidAt: new Date().toISOString().slice(0, 10),
    amount: invoice.balanceDue,
    notes: '',
    internalNotes: '',
  });

  const valid = form.reference.trim().length > 0 && /^\d+(\.\d{1,2})?$/.test(form.amount);

  const record = async () => {
    const token = await reauth.request();
    await recordPayment.mutateAsync({
      clientOrganizationId: invoice.clientOrganizationId,
      reference: form.reference.trim(),
      method: form.method,
      paidAt: new Date(form.paidAt).toISOString(),
      amount: form.amount,
      notes: form.notes.trim() || undefined,
      internalNotes: form.internalNotes.trim() || undefined,
      allocations: [{ invoiceId: invoice.id, amount: form.amount }],
      headers: reauth.headers(token),
    });
  };

  return (
    <>
      <Modal
        open
        size="lg"
        title={`Record a payment against ${invoice.numberLabel}`}
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={recordPayment.isPending}
              disabled={!valid}
              disabledReason="A reference and an amount are required"
              onClick={() => void wrap(record)()}
            >
              Record payment
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <FormField
            label="Reference"
            required
            hint="The bank or gateway reference. Recording the same one twice is refused."
          >
            <Input
              value={form.reference}
              placeholder="NEFT-2026-0912-0031"
              onChange={(event) => setForm({ ...form, reference: event.target.value })}
            />
          </FormField>
          <FormField label="Method" required>
            <Select
              value={form.method}
              onChange={(event) =>
                setForm({ ...form, method: event.target.value as PaymentMethod })
              }
              options={METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }))}
            />
          </FormField>
          <FormField label="Received on" required>
            <Input
              type="date"
              value={form.paidAt}
              onChange={(event) => setForm({ ...form, paidAt: event.target.value })}
            />
          </FormField>
          <FormField label="Amount" required hint={`${invoice.balanceDue} outstanding`}>
            <Input
              value={form.amount}
              inputMode="decimal"
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
            />
          </FormField>
          <FormField label="Notes" hint="Visible to the client">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </FormField>
          <FormField label="Internal notes" hint="Never shown to the client">
            <Textarea
              rows={2}
              value={form.internalNotes}
              onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
            />
          </FormField>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      </Modal>
      {reauth.modal}
    </>
  );
}
