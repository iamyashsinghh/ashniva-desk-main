import {
  PROBLEM_STATUS,
  PROBLEM_STATUS_LABELS,
  RCA_IN_PROGRESS_STATUSES,
  type ProblemStatus,
  type ProblemSummary,
} from '@ashniva/types';
import {
  Badge,
  EmptyState,
  PageHeader,
  PriorityDot,
  SegmentedControl,
  StatusPill,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatRelative } from '../../../shared/lib/format';
import { useProblemsQuery } from '../api';
import { problemTone } from '../problem-display';

import '../problems.css';

/**
 * Problems, grouped by what somebody has to do next rather than by date.
 *
 * "Open" is the view that matters day to day: a problem nobody has asked for an analysis about is
 * a fault several clients keep hitting that nobody has started on, and this screen exists to make
 * that visible.
 */
type View = 'open' | 'rca' | 'fixing' | 'closed' | 'all';

const VIEWS: Record<View, { label: string; statuses?: ProblemStatus[] }> = {
  open: { label: 'Open', statuses: [PROBLEM_STATUS.OPEN] },
  rca: { label: 'RCA in progress', statuses: [...RCA_IN_PROGRESS_STATUSES] },
  fixing: {
    label: 'Fix in flight',
    statuses: [PROBLEM_STATUS.FIX_ASSIGNED, PROBLEM_STATUS.FIX_RELEASED],
  },
  closed: { label: 'Closed', statuses: [PROBLEM_STATUS.CLOSED] },
  all: { label: 'All' },
};

function isView(value: string | null): value is View {
  return value !== null && value in VIEWS;
}

export function ProblemListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: View = isView(raw) ? raw : 'open';
  const query = useProblemsQuery({ status: VIEWS[view].statuses });

  const columns: TableColumn<ProblemSummary>[] = [
    {
      key: 'title',
      header: 'Problem',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.key}</span>
          <span className="task-cell__title">{row.title}</span>
        </div>
      ),
    },
    {
      key: 'clients',
      header: 'Clients',
      width: '90px',
      // The number the whole feature exists to show, counted in companies rather than in tickets.
      render: (row) => (
        <Badge tone={row.thresholdHitAt ? 'danger' : 'neutral'}>{row.clientCount}</Badge>
      ),
    },
    {
      key: 'tickets',
      header: 'Tickets',
      hideOnMobile: true,
      width: '80px',
      render: (row) => row.ticketCount,
    },
    {
      key: 'module',
      header: 'Module',
      hideOnMobile: true,
      width: '140px',
      render: (row) => row.module ?? <span className="muted">—</span>,
    },
    {
      key: 'versions',
      header: 'Versions',
      hideOnMobile: true,
      width: '140px',
      render: (row) =>
        row.versions.length > 0 ? row.versions.join(', ') : <span className="muted">—</span>,
    },
    {
      key: 'severity',
      header: 'Severity',
      width: '110px',
      render: (row) => <PriorityDot priority={row.severity} showLabel />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '170px',
      render: (row) => (
        <StatusPill tone={problemTone(row.status)} label={PROBLEM_STATUS_LABELS[row.status]} />
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      width: '120px',
      render: (row) => formatRelative(row.updatedAt),
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Problems"
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
      >
        <SegmentedControl
          aria-label="Problem view"
          size="sm"
          value={view}
          onChange={(next) => setParams({ view: next }, { replace: true })}
          options={(Object.keys(VIEWS) as View[]).map((key) => ({
            key,
            label: VIEWS[key].label,
          }))}
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
            aria-label="Problems"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/problems/${row.id}`)}
            empty={
              <EmptyState
                title="No problems"
                description="A problem groups the same fault reported by several clients, and holds the analysis and the fix."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
