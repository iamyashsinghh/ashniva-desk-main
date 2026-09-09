import {
  HOUR_LEDGER_KIND,
  HOUR_LEDGER_KIND_LABELS,
  type ContractHourBalance,
  type HourLedgerEntry,
  type HourLedgerKind,
} from '@ashniva/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Kpi,
  KpiGrid,
  Modal,
  Select,
  Table,
  Textarea,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';
import { Link } from 'react-router';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { formatDate, formatDateTime, formatMinutes } from '../../../shared/lib/format';
import { useReauth } from '../../auth/reauth';
import { useContractMutations, useLedgerQuery } from '../api';

/** Balance KPIs for the current billing period. */
export function HoursSummary({ hours }: { hours: ContractHourBalance }) {
  return (
    <KpiGrid>
      <Kpi label="Included" value={formatMinutes(hours.includedMinutes)} />
      <Kpi label="Purchased" value={formatMinutes(hours.purchasedMinutes)} />
      <Kpi label="Carried forward" value={formatMinutes(hours.carriedForwardMinutes)} />
      <Kpi label="Used" value={formatMinutes(hours.consumedMinutes)} />
      <Kpi label="Reserved" value={formatMinutes(hours.reservedMinutes)} />
      <Kpi
        label="Remaining"
        value={formatMinutes(Math.max(0, hours.remainingMinutes))}
        warn={hours.isLow}
        hint={
          hours.remainingMinutes < 0
            ? `${formatMinutes(-hours.remainingMinutes)} over`
            : `${formatDate(hours.periodStart)} – ${formatDate(hours.periodEnd)}`
        }
      />
    </KpiGrid>
  );
}

const SIGN_TONE: Partial<Record<HourLedgerKind, 'success' | 'danger' | 'warning' | 'neutral'>> = {
  CONSUMED: 'danger',
  EXPIRED: 'neutral',
  RESERVED: 'warning',
};

export function LedgerTable({
  entries,
  linkTasks = true,
}: {
  entries: HourLedgerEntry[];
  linkTasks?: boolean;
}) {
  const columns: TableColumn<HourLedgerEntry>[] = [
    { key: 'when', header: 'When', width: '130px', render: (row) => formatDateTime(row.createdAt) },
    {
      key: 'kind',
      header: 'Movement',
      width: '140px',
      render: (row) => (
        <Badge tone={SIGN_TONE[row.kind] ?? 'success'}>{HOUR_LEDGER_KIND_LABELS[row.kind]}</Badge>
      ),
    },
    {
      key: 'minutes',
      header: 'Hours',
      width: '90px',
      align: 'right',
      render: (row) => `${row.minutes < 0 ? '−' : '+'}${formatMinutes(Math.abs(row.minutes))}`,
    },
    {
      key: 'balance',
      header: 'Balance after',
      width: '110px',
      align: 'right',
      hideOnMobile: true,
      render: (row) => formatMinutes(row.balanceAfterMinutes),
    },
    {
      key: 'detail',
      header: 'Detail',
      render: (row) => (
        <span>
          {row.task && linkTasks ? <Link to={`/tasks/${row.task.id}`}>{row.task.key}</Link> : null}
          {row.task && !linkTasks ? row.task.key : null}
          {row.task ? ` ${row.task.title}` : ''}
          {row.ticket ? ` · T-${row.ticket.number}` : ''}
          {row.reason ? <span className="muted"> {row.reason}</span> : null}
          {row.createdBy ? <span className="muted"> · {row.createdBy.name}</span> : null}
        </span>
      ),
    },
  ];
  return (
    <Table
      aria-label="Hour ledger"
      columns={columns}
      rows={entries}
      rowKey={(row) => row.id}
      empty={<EmptyState title="No movements yet" />}
    />
  );
}

const MANUAL_KINDS = [
  HOUR_LEDGER_KIND.PURCHASED,
  HOUR_LEDGER_KIND.ADJUSTMENT,
  HOUR_LEDGER_KIND.RESERVED,
  HOUR_LEDGER_KIND.RELEASED,
] as const;

/** Purchased / reserved / released / adjustment, always with a reason and a password check. */
export function HourMovementModal({
  contractId,
  onClose,
}: {
  contractId: string;
  onClose: () => void;
}) {
  const { moveHours } = useContractMutations(contractId);
  const reauth = useReauth();
  const { error, wrap } = useSubmitHandler(onClose);
  const [kind, setKind] = useState<HourLedgerKind>(HOUR_LEDGER_KIND.PURCHASED);
  const [hours, setHours] = useState('5');
  const [reason, setReason] = useState('');
  const minutes = Math.round(Number(hours || 0) * 60);
  const valid = minutes !== 0 && reason.trim().length >= 3;
  const submit = async () => {
    const token = await reauth.request();
    await moveHours.mutateAsync({
      kind,
      minutes,
      reason: reason.trim(),
      idempotencyKey: `${kind}:${minutes}:${reason.trim()}:${Date.now()}`,
      headers: reauth.headers(token),
    });
  };
  return (
    <>
      <Modal
        open
        title="Adjust support hours"
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              loading={moveHours.isPending}
              disabled={!valid}
              disabledReason="Hours and a reason are required"
              onClick={() => void wrap(submit)()}
            >
              Record
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormField label="Movement" required>
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value as HourLedgerKind)}
              options={MANUAL_KINDS.map((entry) => ({
                value: entry,
                label: HOUR_LEDGER_KIND_LABELS[entry],
              }))}
            />
          </FormField>
          <FormField
            label="Hours"
            required
            hint={kind === 'ADJUSTMENT' ? 'Negative removes hours' : undefined}
          >
            <Input
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
          </FormField>
          <FormGridFull>
            <FormField label="Reason" required hint="Recorded in the ledger and the audit log">
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
          </FormGridFull>
        </FormGrid>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Modal>
      {reauth.modal}
    </>
  );
}

/** Full ledger history with an optional period filter. */
export function LedgerCard({ contractId, periods }: { contractId: string; periods: string[] }) {
  const [periodStart, setPeriodStart] = useState('');
  const ledger = useLedgerQuery(contractId, periodStart || undefined);
  return (
    <Card
      title="Hour ledger"
      headerAddon={
        periods.length > 1 ? (
          <Select
            aria-label="Billing period"
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            options={[
              { value: '', label: 'All periods' },
              ...periods.map((start) => ({ value: start, label: `From ${formatDate(start)}` })),
            ]}
          />
        ) : undefined
      }
    >
      <LedgerTable entries={ledger.data?.items ?? []} />
    </Card>
  );
}
