import type { PaymentSummary } from '@ashniva/types';
import { PAYMENT_METHOD_LABELS } from '@ashniva/types';
import { EmptyState, PageHeader, Table, type TableColumn } from '@ashniva/ui';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate } from '../../../shared/lib/format';
import { usePaymentsQuery } from '../api';

import '../billing.css';
import '../../tasks/tasks.css';

/** Money received, newest first. */
export function PaymentsPage() {
  const query = usePaymentsQuery();

  const columns: TableColumn<PaymentSummary>[] = [
    {
      key: 'reference',
      header: 'Reference',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.reference}</span>
          <span className="task-cell__title">{row.clientName}</span>
        </div>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      hideOnMobile: true,
      width: '130px',
      render: (row) => PAYMENT_METHOD_LABELS[row.method],
    },
    {
      key: 'paidAt',
      header: 'Received',
      hideOnMobile: true,
      width: '110px',
      render: (row) => formatDate(row.paidAt),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: '120px',
      render: (row) => (
        <span className="money">
          {row.currency} {row.amount}
        </span>
      ),
    },
    {
      key: 'unallocated',
      header: 'Unapplied',
      width: '110px',
      render: (row) => <span className="money">{row.unallocatedAmount}</span>,
    },
    {
      key: 'recordedBy',
      header: 'Recorded by',
      hideOnMobile: true,
      width: '140px',
      render: (row) => <span className="muted">{row.recordedByName}</span>,
    },
  ];

  return (
    <div className="tasks-page">
      <PageHeader
        title="Payments"
        subtitle={query.data ? `${query.data.total} recorded` : undefined}
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Payments"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            empty={
              <EmptyState
                title="Nothing received yet"
                description="Payments recorded against invoices appear here."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
