import type { PortalInvoiceSummary } from '@ashniva/types';
import { Badge, Button, EmptyState, PageHeader, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { InvoiceStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';
import { downloadInvoicePdf, usePortalInvoicesQuery } from '../api';

import '../billing.css';
import '../../tasks/tasks.css';

/**
 * Invoices as a client sees them.
 *
 * Everything reachable here has been issued; the API has no route that would return a draft to
 * a client, so there is no status filter to offer.
 */
export function PortalInvoicesPage() {
  const navigate = useNavigate();
  const query = usePortalInvoicesQuery();

  const columns: TableColumn<PortalInvoiceSummary>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.numberLabel}</span>
          <span className="task-cell__title">Issued {formatDate(row.issueDate)}</span>
        </div>
      ),
    },
    {
      key: 'due',
      header: 'Due',
      width: '130px',
      render: (row) => (
        <>
          {formatDate(row.dueDate)}
          {row.isOverdue ? (
            <>
              {' '}
              <Badge tone="danger">Overdue</Badge>
            </>
          ) : null}
        </>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      width: '120px',
      render: (row) => (
        <span className="money">
          {row.currency} {row.total}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Outstanding',
      width: '120px',
      render: (row) => <span className="money">{row.balanceDue}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      render: (row) => <InvoiceStatusPill status={row.status} />,
    },
    {
      key: 'pdf',
      header: '',
      width: '60px',
      render: (row) => (
        <Button
          size="sm"
          aria-label={`Download ${row.numberLabel}`}
          onClick={(event) => {
            event.stopPropagation();
            void downloadInvoicePdf(row.id, row.numberLabel, true);
          }}
        >
          PDF
        </Button>
      ),
    },
  ];

  return (
    <div className="tasks-page">
      <PageHeader title="Invoices" subtitle="What you have been billed, and what is outstanding" />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Your invoices"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/portal/invoices/${row.id}`)}
            empty={
              <EmptyState
                title="No invoices yet"
                description="Invoices appear here once they have been issued to you."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
