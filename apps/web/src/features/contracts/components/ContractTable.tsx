import { CONTRACT_TYPE_LABELS, type ContractSummary } from '@ashniva/types';
import { Badge, EmptyState, Table, Toolbar, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { ContractStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatMinutes } from '../../../shared/lib/format';

interface ContractTableProps {
  contracts: ContractSummary[];
  emptyTitle?: string;
  /** Placeholder rows instead of a spinner, so the page holds still while a view changes. */
  loading?: boolean;
}

/** Remaining hours in words, with the low-hours warning the ledger computed. */
export function HoursCell({ hours }: { hours: ContractSummary['hours'] }) {
  if (!hours) {
    return <span className="muted">—</span>;
  }
  return (
    <Toolbar aria-label="Remaining hours">
      <strong>{formatMinutes(Math.max(0, hours.remainingMinutes))}</strong>
      <span className="muted">left</span>
      {hours.isLow ? <Badge tone="warning">Low</Badge> : null}
      {hours.remainingMinutes < 0 ? <Badge tone="danger">Over</Badge> : null}
    </Toolbar>
  );
}

export function ContractTable({
  contracts,
  emptyTitle = 'No contracts',
  loading = false,
}: ContractTableProps) {
  const navigate = useNavigate();
  const columns: TableColumn<ContractSummary>[] = [
    {
      key: 'contract',
      header: 'Contract',
      render: (contract) => (
        <div className="task-cell">
          <span className="task-cell__key">{contract.number}</span>
          <span className="task-cell__title">{contract.title}</span>
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      hideOnMobile: true,
      width: '170px',
      render: (contract) => contract.clientOrganization.name,
    },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      width: '150px',
      render: (contract) => CONTRACT_TYPE_LABELS[contract.type],
    },
    {
      key: 'dates',
      header: 'Ends',
      hideOnMobile: true,
      width: '130px',
      render: (contract) => (
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          {formatDate(contract.endDate)}
          {contract.isExpiringSoon ? <Badge tone="warning">Expiring</Badge> : null}
        </span>
      ),
    },
    {
      key: 'hours',
      header: 'Support hours',
      width: '160px',
      render: (contract) => <HoursCell hours={contract.hours} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (contract) => <ContractStatusPill status={contract.status} />,
    },
  ];
  return (
    <Table
      aria-label="Contracts"
      columns={columns}
      rows={contracts}
      rowKey={(contract) => contract.id}
      onRowClick={(contract) => void navigate(`/contracts/${contract.id}`)}
      loading={loading}
      empty={<EmptyState title={emptyTitle} />}
    />
  );
}
