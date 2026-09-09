import {
  INVOICE_STATUS,
  OPEN_INVOICE_STATUSES,
  PERMISSIONS,
  type InvoiceStatus,
  type InvoiceSummary,
} from '@ashniva/types';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { InvoiceStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useInvoicesQuery } from '../api';

import '../billing.css';
import '../../tasks/tasks.css';

type View = 'open' | 'overdue' | 'draft' | 'paid' | 'all';

const VIEWS: Record<View, { label: string; statuses?: InvoiceStatus[] }> = {
  open: { label: 'Outstanding', statuses: [...OPEN_INVOICE_STATUSES] },
  overdue: { label: 'Overdue', statuses: [INVOICE_STATUS.OVERDUE] },
  draft: { label: 'Drafts', statuses: [INVOICE_STATUS.DRAFT] },
  paid: { label: 'Paid', statuses: [INVOICE_STATUS.PAID] },
  all: { label: 'All' },
};

/** Invoices, grouped by what needs attention. */
export function InvoicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canWrite = usePermission(PERMISSIONS.INVOICE_WRITE);
  const view = (params.get('view') ?? 'open') as View;
  const search = params.get('q') ?? '';
  const query = useInvoicesQuery({
    status: VIEWS[view]?.statuses,
    search: search || undefined,
  });

  const columns: TableColumn<InvoiceSummary>[] = [
    {
      key: 'number',
      header: 'Invoice',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">
            {row.status === 'DRAFT' ? 'Draft' : row.numberLabel}
          </span>
          <span className="task-cell__title">{row.clientName}</span>
        </div>
      ),
    },
    {
      key: 'issued',
      header: 'Issued',
      hideOnMobile: true,
      width: '110px',
      render: (row) => formatDate(row.issueDate),
    },
    {
      key: 'due',
      header: 'Due',
      hideOnMobile: true,
      width: '130px',
      render: (row) => (
        <>
          {formatDate(row.dueDate)}
          {row.isOverdue ? (
            <>
              {' '}
              <Badge tone="danger">Late</Badge>
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
      hideOnMobile: true,
      width: '120px',
      render: (row) => <span className="money">{row.balanceDue}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '140px',
      render: (row) => <InvoiceStatusPill status={row.status} />,
    },
  ];

  return (
    <div className="tasks-page">
      <PageHeader
        title="Invoices"
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
        actions={
          canWrite ? (
            <Button variant="primary" onClick={() => void navigate('/invoices/new')}>
              New invoice
            </Button>
          ) : undefined
        }
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) =>
            setParams({ view: next, ...(search ? { q: search } : {}) }, { replace: true })
          }
          options={(Object.keys(VIEWS) as View[]).map((key) => ({ key, label: VIEWS[key].label }))}
        />
        <Input
          aria-label="Search invoices"
          placeholder="Invoice number or client"
          value={search}
          onChange={(event) =>
            setParams(
              { view, ...(event.target.value ? { q: event.target.value } : {}) },
              { replace: true },
            )
          }
        />
      </PageHeader>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Invoices"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/invoices/${row.id}`)}
            empty={
              <EmptyState
                title="No invoices"
                description="Raise an invoice against a client, a milestone or a change request."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
