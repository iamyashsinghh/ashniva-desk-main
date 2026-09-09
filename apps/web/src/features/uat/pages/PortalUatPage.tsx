import { UAT_DECISION, type UatRequestSummary } from '@ashniva/types';
import { Badge, EmptyState, PageHeader, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatRelative } from '../../../shared/lib/format';
import { usePortalUatListQuery } from '../api';

/** Everything this client has been asked to sign off, waiting ones first. */
export function PortalUatPage() {
  const navigate = useNavigate();
  const query = usePortalUatListQuery();

  const columns: TableColumn<UatRequestSummary>[] = [
    {
      key: 'summary',
      header: 'Change',
      render: (row) => <span className="task-cell__title">{row.summaryPlain}</span>,
    },
    {
      key: 'checklist',
      header: 'To check',
      hideOnMobile: true,
      width: '110px',
      render: (row) =>
        row.checklist.length > 0 ? (
          `${row.checklist.length} item${row.checklist.length === 1 ? '' : 's'}`
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'asked',
      header: 'Asked',
      hideOnMobile: true,
      width: '120px',
      render: (row) => <span className="muted">{formatRelative(row.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '170px',
      render: (row) => <UatStatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Sign-off"
        subtitle="Changes waiting for your approval before they go live"
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Sign-off requests"
            columns={columns}
            rows={query.data}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/portal/uat/${row.id}`)}
            empty={
              <EmptyState
                title="Nothing to sign off"
                description="When a change is ready for you to check, it will appear here."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}

export function UatStatusBadge({ status }: { status: UatRequestSummary['status'] }) {
  if (status === UAT_DECISION.APPROVED) {
    return <Badge tone="success">Approved</Badge>;
  }
  if (status === UAT_DECISION.CHANGES_REQUESTED) {
    return <Badge tone="warning">Changes requested</Badge>;
  }
  return <Badge tone="review">Waiting for you</Badge>;
}
