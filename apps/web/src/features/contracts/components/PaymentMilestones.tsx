import {
  PAYMENT_MILESTONE_STATUS,
  PAYMENT_MILESTONE_STATUS_LABELS,
  type ContractDetail,
  type PaymentMilestoneStatus,
  type PaymentMilestoneSummary,
} from '@ashniva/types';
import {
  Alert,
  Button,
  EmptyState,
  FormActions,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';

import { PaymentStatusPill } from '../../../shared/components/StatusPills';
import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { formatDate } from '../../../shared/lib/format';
import { useContractMutations } from '../api';

interface PaymentMilestonesProps {
  contract: ContractDetail;
  canManage: boolean;
  showAmounts: boolean;
}

/** Payment schedule of a contract: pending → invoiced → paid, optionally tied to a milestone. */
export function PaymentMilestones({ contract, canManage, showAmounts }: PaymentMilestonesProps) {
  const [editing, setEditing] = useState<PaymentMilestoneSummary | 'new' | null>(null);
  const { removePayment } = useContractMutations(contract.id);
  const columns: TableColumn<PaymentMilestoneSummary>[] = [
    { key: 'title', header: 'Payment', render: (row) => row.title },
    ...(showAmounts
      ? [
          {
            key: 'amount',
            header: 'Amount',
            width: '130px',
            align: 'right' as const,
            render: (row: PaymentMilestoneSummary) => `${row.currency} ${row.amount}`,
          },
        ]
      : []),
    {
      key: 'due',
      header: 'Due',
      width: '110px',
      hideOnMobile: true,
      render: (row) => formatDate(row.dueDate),
    },
    {
      key: 'milestone',
      header: 'Delivery milestone',
      hideOnMobile: true,
      render: (row) => row.milestone?.name ?? <span className="muted">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (row) => <PaymentStatusPill status={row.status} />,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '150px',
            render: (row: PaymentMilestoneSummary) => (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Button size="sm" onClick={() => setEditing(row)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void removePayment.mutateAsync(row.id)}
                >
                  Remove
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      {canManage ? (
        <div className="stack-bottom">
          <FormActions>
            <Button size="sm" onClick={() => setEditing('new')}>
              + Payment milestone
            </Button>
          </FormActions>
        </div>
      ) : null}
      <Table
        aria-label="Payment milestones"
        columns={columns}
        rows={contract.paymentMilestones}
        rowKey={(row) => row.id}
        empty={<EmptyState title="No payment milestones" />}
      />
      {editing ? (
        <PaymentMilestoneModal
          contract={contract}
          payment={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function PaymentMilestoneModal({
  contract,
  payment,
  onClose,
}: {
  contract: ContractDetail;
  payment?: PaymentMilestoneSummary;
  onClose: () => void;
}) {
  const { addPayment, updatePayment } = useContractMutations(contract.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    title: payment?.title ?? '',
    amount: payment?.amount ?? '',
    dueDate: payment?.dueDate ?? '',
    status: payment?.status ?? PAYMENT_MILESTONE_STATUS.PENDING,
    invoiceReference: payment?.invoiceReference ?? '',
    milestoneId: payment?.milestone?.id ?? '',
  });
  const valid = form.title.trim().length >= 2 && /^\d+(\.\d{1,2})?$/.test(form.amount);
  const save = () =>
    payment
      ? updatePayment.mutateAsync({
          paymentId: payment.id,
          title: form.title.trim(),
          amount: form.amount,
          dueDate: form.dueDate || null,
          status: form.status,
          invoiceReference: form.invoiceReference || null,
          milestoneId: form.milestoneId || null,
        })
      : addPayment.mutateAsync({
          title: form.title.trim(),
          amount: form.amount,
          dueDate: form.dueDate || null,
          milestoneId: form.milestoneId || null,
        });
  return (
    <Modal
      open
      title={payment ? 'Edit payment milestone' : 'Add payment milestone'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={addPayment.isPending || updatePayment.isPending}
            disabled={!valid}
            disabledReason="Title and a decimal amount are required"
            onClick={() => void wrap(save)()}
          >
            Save
          </Button>
        </>
      }
    >
      <FormGrid>
        <FormGridFull>
          <FormField label="Title" required>
            <Input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </FormField>
        </FormGridFull>
        <FormField label={`Amount (${contract.currency})`} required>
          <Input
            inputMode="decimal"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </FormField>
        <FormField label="Due date">
          <Input
            type="date"
            value={form.dueDate}
            onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
          />
        </FormField>
        <FormField label="Delivery milestone">
          <Select
            value={form.milestoneId}
            onChange={(event) => setForm({ ...form, milestoneId: event.target.value })}
            options={[
              { value: '', label: 'None' },
              ...contract.milestones.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />
        </FormField>
        {payment ? (
          <>
            <FormField label="Status">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as PaymentMilestoneStatus })
                }
                options={Object.values(PAYMENT_MILESTONE_STATUS).map((status) => ({
                  value: status,
                  label: PAYMENT_MILESTONE_STATUS_LABELS[status],
                }))}
              />
            </FormField>
            <FormField label="Invoice reference">
              <Input
                value={form.invoiceReference}
                onChange={(event) => setForm({ ...form, invoiceReference: event.target.value })}
              />
            </FormField>
          </>
        ) : null}
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
