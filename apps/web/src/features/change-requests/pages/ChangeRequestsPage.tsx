import {
  CHANGE_REQUEST_STATUS,
  PERMISSIONS,
  type ChangeRequestStatus,
  type ChangeRequestSummary,
} from '@ashniva/types';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ChangeRequestStatusPill } from '../../../shared/components/StatusPills';
import { formatMinutes, formatRelative } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useChangeRequestsQuery } from '../api';
import { formatCost } from '../format';
import { ChangeRequestFormModal } from '../components/ChangeRequestFormModal';

type View = 'open' | 'needs-us' | 'waiting-client' | 'done' | 'all';

const VIEWS: Record<View, { label: string; statuses?: ChangeRequestStatus[] }> = {
  open: {
    label: 'Open',
    statuses: [
      CHANGE_REQUEST_STATUS.DRAFT,
      CHANGE_REQUEST_STATUS.SUBMITTED,
      CHANGE_REQUEST_STATUS.INTERNAL_REVIEW,
      CHANGE_REQUEST_STATUS.CLIENT_REVIEW,
      CHANGE_REQUEST_STATUS.CHANGES_REQUESTED,
      CHANGE_REQUEST_STATUS.APPROVED,
      CHANGE_REQUEST_STATUS.SCHEDULED,
    ],
  },
  'needs-us': {
    label: 'Needs us',
    statuses: [
      CHANGE_REQUEST_STATUS.SUBMITTED,
      CHANGE_REQUEST_STATUS.INTERNAL_REVIEW,
      CHANGE_REQUEST_STATUS.APPROVED,
      CHANGE_REQUEST_STATUS.SCHEDULED,
    ],
  },
  'waiting-client': {
    label: 'Waiting for client',
    statuses: [CHANGE_REQUEST_STATUS.CLIENT_REVIEW, CHANGE_REQUEST_STATUS.CHANGES_REQUESTED],
  },
  done: {
    label: 'Closed',
    statuses: [
      CHANGE_REQUEST_STATUS.COMPLETED,
      CHANGE_REQUEST_STATUS.REJECTED,
      CHANGE_REQUEST_STATUS.CANCELLED,
    ],
  },
  all: { label: 'All' },
};

/** Internal change-request list with the same "who is it waiting on" views as approvals. */
export function ChangeRequestsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const canCreate = usePermission(PERMISSIONS.CHANGE_REQUEST_RAISE);
  const view = (params.get('view') ?? 'open') as View;
  const search = params.get('q') ?? '';
  const query = useChangeRequestsQuery({
    status: VIEWS[view]?.statuses,
    search: search || undefined,
  });

  const columns: TableColumn<ChangeRequestSummary>[] = [
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
      key: 'client',
      header: 'Client',
      hideOnMobile: true,
      width: '160px',
      render: (row) => row.clientOrganization.name,
    },
    {
      key: 'project',
      header: 'Project',
      hideOnMobile: true,
      width: '160px',
      render: (row) => row.project?.name ?? '—',
    },
    {
      key: 'estimate',
      header: 'Estimate',
      hideOnMobile: true,
      width: '110px',
      render: (row) => (row.estimatedMinutes !== null ? formatMinutes(row.estimatedMinutes) : '—'),
    },
    {
      key: 'cost',
      header: 'Cost impact',
      hideOnMobile: true,
      width: '120px',
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
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Raise a change request
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
          aria-label="Search change requests"
          placeholder="Search by number or title"
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
            aria-label="Change requests"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/change-requests/${row.id}`)}
            empty={
              <EmptyState
                title="No change requests"
                description="Scope changes raised by clients or staff appear here with their approval status."
              />
            }
          />
        ) : null}
      </QueryState>
      {creating ? (
        <ChangeRequestFormModal
          onClose={() => setCreating(false)}
          onSaved={(id) => void navigate(`/change-requests/${id}`)}
        />
      ) : null}
    </div>
  );
}
