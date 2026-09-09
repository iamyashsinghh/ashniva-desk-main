import {
  RELEASE_STATUS,
  RELEASE_STATUS_LABELS,
  type ReleaseStatus,
  type ReleaseSummary,
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
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { useReleasesQuery } from '../api';

/**
 * Releases, grouped by where they are rather than by date.
 *
 * "In flight" is the view that matters day to day: anything between drafted and published is
 * somebody's outstanding work, and a release sitting in APPROVAL_REQUESTED for a week is the
 * failure this screen exists to make visible.
 */

type View = 'in-flight' | 'awaiting-approval' | 'published' | 'all';

const VIEWS: Record<View, { label: string; statuses?: ReleaseStatus[] }> = {
  'in-flight': {
    label: 'In flight',
    statuses: [
      RELEASE_STATUS.DRAFT,
      RELEASE_STATUS.APPROVAL_REQUESTED,
      RELEASE_STATUS.APPROVED,
      RELEASE_STATUS.SCHEDULED,
      RELEASE_STATUS.PUBLISHING,
    ],
  },
  'awaiting-approval': {
    label: 'Awaiting approval',
    statuses: [RELEASE_STATUS.APPROVAL_REQUESTED],
  },
  published: {
    label: 'Published',
    statuses: [RELEASE_STATUS.PUBLISHED, RELEASE_STATUS.VERIFIED],
  },
  all: { label: 'All' },
};

/** Rolled back and failed are the two a reader must not skim past. */
function toneFor(status: ReleaseStatus): 'danger' | 'success' | 'neutral' {
  if (status === RELEASE_STATUS.ROLLED_BACK || status === RELEASE_STATUS.FAILED) {
    return 'danger';
  }
  return status === RELEASE_STATUS.VERIFIED || status === RELEASE_STATUS.PUBLISHED
    ? 'success'
    : 'neutral';
}

function isView(value: string | null): value is View {
  return value !== null && value in VIEWS;
}

export function ReleasesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: View = isView(raw) ? raw : 'in-flight';

  const query = useReleasesQuery({ status: VIEWS[view].statuses });

  const columns: TableColumn<ReleaseSummary>[] = [
    {
      key: 'version',
      header: 'Release',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.projectName}</span>
          <span className="task-cell__title">
            {row.version} — {row.title}
          </span>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      hideOnMobile: true,
      width: '80px',
      render: (row) => row.itemCount,
    },
    {
      key: 'scheduled',
      header: 'Scheduled',
      hideOnMobile: true,
      width: '130px',
      render: (row) =>
        row.scheduledFor ? formatDate(row.scheduledFor) : <span className="muted">—</span>,
    },
    {
      key: 'published',
      header: 'Published',
      hideOnMobile: true,
      width: '130px',
      render: (row) =>
        row.publishedAt ? formatRelative(row.publishedAt) : <span className="muted">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '160px',
      render: (row) => (
        <Badge tone={toneFor(row.status)}>{RELEASE_STATUS_LABELS[row.status]}</Badge>
      ),
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Releases"
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
      >
        <SegmentedControl
          aria-label="Release view"
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
            aria-label="Releases"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/releases/${row.id}`)}
            empty={
              <EmptyState
                title="No releases"
                description="A release collects the tasks and tickets going out together, and records who approved it."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
