import { TESTER_VIEW, type TesterView, type TestingAssignmentSummary } from '@ashniva/types';
import { EmptyState, PageHeader, SegmentedControl, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { useTesterQueue } from '../api';
import {
  ASSIGNMENT_KIND_LABELS,
  ENVIRONMENT_LABELS,
  TESTER_VIEW_LABELS,
  TESTER_VIEW_ORDER,
} from '../qa-labels';

import '../../dashboard/dashboard.css';

/**
 * The QA workspace.
 *
 * Nine views, because a tester's day is nine different questions and answering them by filtering
 * one list is how things get missed. The counts come back with the queue in a single request, so
 * switching view is instant and the badges cannot disagree with the rows beneath them.
 */

function isTesterView(value: string | null): value is TesterView {
  return value !== null && TESTER_VIEW_ORDER.includes(value as TesterView);
}

export function TesterQueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: TesterView = isTesterView(raw) ? raw : TESTER_VIEW.MINE;

  const query = useTesterQueue(view);
  const counts = query.data?.counts;

  const columns: TableColumn<TestingAssignmentSummary>[] = [
    {
      key: 'subject',
      header: 'What to test',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.projectName}</span>
          <span className="task-cell__title">{row.subjectLabel}</span>
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      width: '140px',
      render: (row) => ASSIGNMENT_KIND_LABELS[row.kind],
    },
    {
      key: 'environment',
      header: 'Environment',
      hideOnMobile: true,
      render: (row) => ENVIRONMENT_LABELS[row.environment],
    },
    {
      key: 'due',
      header: 'Due',
      width: '120px',
      render: (row) =>
        row.dueAt ? (
          // Overdue is decided on the server against its own clock, not by comparing dates in a
          // browser whose timezone is anybody's guess.
          <span className={row.isOverdue ? 'due--overdue' : undefined}>
            {formatDate(row.dueAt)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      width: '110px',
      render: (row) => <span className="muted">{formatRelative(row.updatedAt)}</span>,
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Testing"
        subtitle="Everything waiting on QA, retest, live checks and client UAT"
      >
        <SegmentedControl
          aria-label="Tester view"
          size="sm"
          value={view}
          onChange={(next) => setParams({ view: next }, { replace: true })}
          options={TESTER_VIEW_ORDER.map((key) => ({
            key,
            label: counts ? `${TESTER_VIEW_LABELS[key]} (${counts[key]})` : TESTER_VIEW_LABELS[key],
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
            aria-label="Testing assignments"
            columns={columns}
            rows={query.data.queue}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/qa/${row.id}`)}
            empty={
              <EmptyState
                title="Nothing here"
                description={`No assignments in "${TESTER_VIEW_LABELS[view]}" right now.`}
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
