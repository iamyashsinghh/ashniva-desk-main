import {
  PAYMENT_METHOD_LABELS,
  type InvoiceDetail,
  type PaymentMethod,
  type PaymentSummary,
} from '@ashniva/types';
import { useState } from 'react';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { Banner } from '../../shared/components/feedback';
import { Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import type { SelectOption } from '../../shared/components/SelectSheet';
import { Sheet } from '../../shared/components/Sheet';
import { todayIsoDate } from '../../shared/format/format';
import { useClientOptions } from '../projects/project-form-options';
import { ToggleRow } from '../tasks/ToggleRow';
import { BILLING_INVALIDATES, type RecordPaymentInput } from './billing-api';
import { ConfirmPasswordField } from './ConfirmPasswordField';
import { useGuardedWrite } from './guarded-write';
import { SheetActions } from './SheetActions';

const METHOD_OPTIONS: SelectOption<PaymentMethod>[] = (
  Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]
).map((value) => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

/** What the API takes: positive, at most two decimals. The API has the final word. */
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * Recording money received — the web's payment dialog.
 *
 * Opened from an invoice, it is recorded against that invoice and the amount defaults to the
 * outstanding balance, which is what is usually paid; the API refuses an overpayment rather than
 * absorbing it. Opened from the payments list, the client is picked and the API settles that
 * client's oldest open invoices first, unless it is kept as an unapplied credit.
 *
 * Asserting that money arrived settles invoices against it, so the API asks for the password again.
 */
export function RecordPaymentSheet({
  invoice,
  onClose,
  onDone,
}: {
  invoice?: InvoiceDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const clients = useClientOptions();
  const [clientId, setClientId] = useState(invoice?.clientOrganizationId ?? '');
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [paidOn, setPaidOn] = useState<string | null>(todayIsoDate());
  const [amount, setAmount] = useState(invoice?.balanceDue ?? '');
  const [keepAsCredit, setKeepAsCredit] = useState(false);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [password, setPassword] = useState('');
  const write = useGuardedWrite<RecordPaymentInput, PaymentSummary>({
    path: '/payments',
    body: (variables) => variables,
    invalidate: BILLING_INVALIDATES,
    onSuccess: onDone,
  });

  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      write.reset();
      set(value);
    };

  const trimmedAmount = amount.trim();
  const ready =
    clientId.length > 0 &&
    reference.trim().length > 0 &&
    paidOn !== null &&
    AMOUNT.test(trimmedAmount) &&
    password.length > 0;

  const submit = () => {
    if (!paidOn) {
      return;
    }
    let settlement: Pick<RecordPaymentInput, 'allocations' | 'leaveUnallocated'> = {};
    if (invoice) {
      settlement = { allocations: [{ invoiceId: invoice.id, amount: trimmedAmount }] };
    } else if (keepAsCredit) {
      settlement = { leaveUnallocated: true };
    }
    void write.run(
      {
        clientOrganizationId: clientId,
        reference: reference.trim(),
        method,
        paidAt: new Date(paidOn).toISOString(),
        amount: trimmedAmount,
        notes: notes.trim() || undefined,
        internalNotes: internalNotes.trim() || undefined,
        ...settlement,
      },
      password,
    );
  };

  return (
    <Sheet
      visible
      title="Record a payment"
      subtitle={invoice ? `Against ${invoice.numberLabel}` : 'Money received from a client'}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Record payment"
          confirmIcon="checkmark-circle-outline"
          busy={write.busy}
          disabled={!ready}
          onCancel={onClose}
          onConfirm={submit}
        />
      }
    >
      {invoice ? null : (
        <SelectField
          label="Received from"
          required
          icon="business-outline"
          options={clients.options}
          loading={clients.isLoading}
          value={clientId ? [clientId] : []}
          onChange={(values) => edit(setClientId)(values[0] ?? '')}
          placeholder="Choose a client"
        />
      )}
      <Field
        label="Reference"
        required
        hint="The bank or gateway reference. Recording the same one twice is refused."
      >
        <Input
          accessibilityLabel="Reference"
          value={reference}
          onChangeText={edit(setReference)}
          placeholder="NEFT-2026-0912-0031"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={100}
        />
      </Field>
      <SelectField
        label="Method"
        required
        icon="wallet-outline"
        options={METHOD_OPTIONS}
        value={[method]}
        onChange={(values) => {
          if (values[0]) {
            edit(setMethod)(values[0]);
          }
        }}
      />
      <DateTimeField
        label="Received on"
        required
        allowClear={false}
        value={paidOn}
        onChange={edit(setPaidOn)}
        hint="Not in the future"
      />
      <Field
        label="Amount"
        required
        hint={invoice ? `${invoice.balanceDue} outstanding` : 'Two decimals at most'}
      >
        <Input
          accessibilityLabel="Amount"
          value={amount}
          onChangeText={edit(setAmount)}
          keyboardType="decimal-pad"
          invalid={trimmedAmount.length > 0 && !AMOUNT.test(trimmedAmount)}
        />
      </Field>
      {invoice ? null : (
        <ToggleRow
          label="Keep as credit"
          icon="wallet-outline"
          description="Leave it unapplied instead of settling the client's oldest open invoices first."
          value={keepAsCredit}
          onChange={edit(setKeepAsCredit)}
        />
      )}
      <Field label="Notes" hint="Visible to the client">
        <Input
          accessibilityLabel="Notes"
          value={notes}
          onChangeText={edit(setNotes)}
          multiline
          style={{ minHeight: 64 }}
        />
      </Field>
      <Field label="Internal notes" hint="Never shown to the client">
        <Input
          accessibilityLabel="Internal notes"
          value={internalNotes}
          onChangeText={edit(setInternalNotes)}
          multiline
          style={{ minHeight: 64 }}
        />
      </Field>
      <ConfirmPasswordField
        value={password}
        onChange={edit(setPassword)}
        reason="Recording a payment settles invoices, so the server asks you to confirm it is you."
      />
      {write.error ? (
        <Banner tone="danger" role="alert">
          {write.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
