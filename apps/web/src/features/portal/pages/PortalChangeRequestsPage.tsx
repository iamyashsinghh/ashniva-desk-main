import { PERMISSIONS, type PortalChangeRequestSummary } from '@ashniva/types';
import { Button, EmptyState, PageHeader, Table, type TableColumn } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ChangeRequestStatusPill } from '../../../shared/components/StatusPills';
import { formatRelative } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { usePortalChangeRequestsQuery } from '../../change-requests/api';
import { ChangeRequestFormModal } from '../../change-requests/components/ChangeRequestFormModal';
import { formatCost } from '../../change-requests/format';

/** Client list of their change requests, with the button to raise a new one. */
export function PortalChangeRequestsPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const canRaise = usePermission(PERMISSIONS.CHANGE_REQUEST_RAISE);
  const query = usePortalChangeRequestsQuery();
  const columns: TableColumn<PortalChangeRequestSummary>[] = [
    {
      key: 'title',
      header: 'Change request',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.number}</span>
          <span className="task-cell__title">{row.title}</span>
        </div>
      ),
    },
    {
      key: 'project',
      header: 'Project',
      hideOnMobile: true,
      width: '170px',
      render: (row) => row.project?.name ?? '—',
    },
    {
      key: 'cost',
      header: 'Cost impact',
      hideOnMobile: true,
      width: '130px',
      render: (row) => formatCost(row.costImpact, row.currency),
    },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      width: '110px',
      render: (row) => <span className="muted">{formatRelative(row.updatedAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '150px',
      render: (row) => <ChangeRequestStatusPill status={row.status} />,
    },
  ];
  return (
    <div className="list-page">
      <PageHeader
        title="Change requests"
        subtitle="Ask for a change to the agreed scope and follow its approval."
        actions={
          canRaise ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Raise a change request
            </Button>
          ) : undefined
        }
      />
      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
      >
        {query.data ? (
          <Table
            aria-label="Change requests"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/portal/change-requests/${row.id}`)}
            empty={
              <EmptyState
                title="No change requests yet"
                description="Raise one when you need something beyond the agreed scope."
              />
            }
          />
        ) : null}
      </QueryState>
      {creating ? (
        <ChangeRequestFormModal
          portal
          onClose={() => setCreating(false)}
          onSaved={(id) => void navigate(`/portal/change-requests/${id}`)}
        />
      ) : null}
    </div>
  );
}
