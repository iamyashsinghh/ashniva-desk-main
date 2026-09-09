import {
  APPROVAL_LIST_VIEW,
  APPROVAL_SUBJECT_TYPE_LABELS,
  type ApprovalListView,
  type ApprovalSummary,
} from '@ashniva/types';
import {
  Badge,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ApprovalStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { useApprovalsQuery } from '../api';

const VIEW_LABELS: Record<ApprovalListView, string> = {
  inbox: 'Needs us',
  mine: 'Requested by me',
  'waiting-client': 'Waiting for client',
  decided: 'Decided',
  all: 'All',
};

/** Internal approvals inbox: what needs the provider, what waits for clients, what was decided. */
export function ApprovalsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get('view') ?? APPROVAL_LIST_VIEW.INBOX) as ApprovalListView;
  const approvals = useApprovalsQuery({ view });
  const columns: TableColumn<ApprovalSummary>[] = [
    {
      key: 'title',
      header: 'Request',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">
            {row.title}
            {row.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
          </span>
          <span className="task-cell__title">
            {APPROVAL_SUBJECT_TYPE_LABELS[row.subject.type]} · {row.subject.label}
          </span>
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
      key: 'requested',
      header: 'Requested by',
      hideOnMobile: true,
      width: '150px',
      render: (row) => row.requestedBy.name,
    },
    {
      key: 'due',
      header: 'Due',
      hideOnMobile: true,
      width: '100px',
      render: (row) => formatDate(row.dueDate),
    },
    {
      key: 'decided',
      header: 'Last change',
      width: '110px',
      render: (row) => (
        <span className="muted">
          {row.decidedAt
            ? `${row.decidedBy?.name ?? ''} · ${formatRelative(row.decidedAt)}`
            : formatRelative(row.updatedAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '150px',
      render: (row) => <ApprovalStatusPill status={row.status} />,
    },
  ];
  return (
    <div className="list-page">
      <PageHeader
        title="Client approvals"
        subtitle={approvals.data ? `${approvals.data.total} requests` : undefined}
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) => setParams({ view: next }, { replace: true })}
          options={Object.values(APPROVAL_LIST_VIEW).map((entry) => ({
            key: entry,
            label: VIEW_LABELS[entry],
          }))}
        />
      </PageHeader>
      <QueryState
        isLoading={approvals.isLoading}
        isError={approvals.isError}
        error={approvals.error}
        onRetry={() => void approvals.refetch()}
      >
        {approvals.data ? (
          <Table
            aria-label="Approval requests"
            columns={columns}
            rows={approvals.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/approvals/${row.id}`)}
            empty={
              <EmptyState
                title="Nothing here"
                description="Approval requests are prepared from milestones, documents, updates and change requests."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
