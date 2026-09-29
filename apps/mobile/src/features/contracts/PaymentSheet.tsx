import {
  PAYMENT_MILESTONE_STATUS,
  type ContractDetail,
  type PaymentMilestoneStatus,
  type PaymentMilestoneSummary,
} from '@ashniva/types';
import { useState } from 'react';

import { useApiMutation } from '../../shared/api/mutations';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Field, Input } from '../../shared/components/primitives';
import { SelectField } from '../../shared/components/SelectField';
import { Sheet } from '../../shared/components/Sheet';
import { ErrorNote, SheetActions } from './commercial-ui';
import { CONTRACT_INVALIDATES, isAmount, paymentStatusLabel } from './contract-display';

const STATUS_OPTIONS = Object.values(PAYMENT_MILESTONE_STATUS).map((status) => ({
  value: status,
  label: paymentStatusLabel(status),
}));

interface PaymentForm {
  title: string;
  amount: string;
  dueDate: string | null;
  status: PaymentMilestoneStatus;
  invoiceReference: string;
  milestoneId: string | null;
}

/**
 * Adding or editing one payment milestone. Status and invoice reference are offered only when
 * editing: a new payment starts pending, and it has no invoice until somebody raises one.
 */
export function PaymentSheet({
  contract,
  payment,
  onClose,
}: {
  contract: ContractDetail;
  payment?: PaymentMilestoneSummary;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PaymentForm>({
    title: payment?.title ?? '',
    amount: payment?.amount ?? '',
    dueDate: payment?.dueDate ?? null,
    status: payment?.status ?? PAYMENT_MILESTONE_STATUS.PENDING,
    invoiceReference: payment?.invoiceReference ?? '',
    milestoneId: payment?.milestone?.id ?? null,
  });
  const set = <K extends keyof PaymentForm>(key: K, value: PaymentForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useApiMutation<PaymentForm, PaymentMilestoneSummary>({
    path: payment
      ? `/contracts/${contract.id}/payment-milestones/${payment.id}`
      : `/contracts/${contract.id}/payment-milestones`,
    method: payment ? 'PATCH' : 'POST',
    body: (values) => ({
      title: values.title.trim(),
      amount: values.amount.trim(),
      dueDate: values.dueDate,
      milestoneId: values.milestoneId,
      ...(payment
        ? { status: values.status, invoiceReference: values.invoiceReference.trim() || null }
        : {}),
    }),
    invalidate: CONTRACT_INVALIDATES,
    onSuccess: onClose,
  });

  const amountProblem =
    form.amount.trim() && !isAmount(form.amount) ? 'A number with at most two decimals.' : null;
  const valid = form.title.trim().length >= 2 && isAmount(form.amount);
  const milestoneOptions = contract.milestones.map((milestone) => ({
    value: milestone.id,
    label: milestone.name,
  }));

  return (
    <Sheet
      visible
      title={payment ? 'Edit payment milestone' : 'Add payment milestone'}
      onClose={onClose}
      footer={
        <SheetActions
          confirmLabel="Save"
          confirmIcon="checkmark"
          busy={save.busy}
          disabled={!valid}
          onCancel={onClose}
          onConfirm={() => void save.run(form)}
        />
      }
    >
      <Field label="Title" required>
        <Input
          accessibilityLabel="Title"
          value={form.title}
          maxLength={200}
          onChangeText={(value) => set('title', value)}
        />
      </Field>
      <Field
        label={`Amount (${contract.currency})`}
        required
        {...(amountProblem ? { error: amountProblem } : {})}
      >
        <Input
          accessibilityLabel="Amount"
          keyboardType="decimal-pad"
          value={form.amount}
          onChangeText={(value) => set('amount', value)}
        />
      </Field>
      <DateTimeField
        label="Due date"
        value={form.dueDate}
        onChange={(value) => set('dueDate', value)}
      />
      <SelectField
        label="Delivery milestone"
        icon="flag-outline"
        options={milestoneOptions}
        value={form.milestoneId ? [form.milestoneId] : []}
        onChange={(ids) => set('milestoneId', ids[0] ?? null)}
        allowClear
        clearLabel="None"
        placeholder="None"
      />
      {payment ? (
        <>
          <SelectField
            label="Status"
            icon="flag-outline"
            options={STATUS_OPTIONS}
            value={[form.status]}
            onChange={(values) => set('status', values[0] ?? form.status)}
          />
          <Field label="Invoice reference">
            <Input
              accessibilityLabel="Invoice reference"
              value={form.invoiceReference}
              maxLength={100}
              onChangeText={(value) => set('invoiceReference', value)}
            />
          </Field>
        </>
      ) : null}
      <ErrorNote message={save.error} />
    </Sheet>
  );
}
