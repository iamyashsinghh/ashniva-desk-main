import {
  PROBLEM_STATUS_LABELS,
  RECURRING_GROUP_BY,
  RECURRING_GROUP_BY_LABELS,
  type RecurringGroupBy,
  type RecurringGroupRow,
} from '@ashniva/types';
import {
  Badge,
  EmptyState,
  PageHeader,
  SegmentedControl,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { Link, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { useRecurringReportQuery } from '../api';

import '../problems.css';

const GROUPINGS = Object.values(RECURRING_GROUP_BY);
const WINDOW_DAYS = 30;

function isGrouping(value: string | null): value is RecurringGroupBy {
  return value !== null && (GROUPINGS as string[]).includes(value);
}

/**
 * What keeps coming back, and to how many separate clients.
 *
 * The frequency bar is scaled against the busiest row rather than against an absolute number: the
 * question this screen answers is "which of these is worst", and an absolute scale would make
 * every row on a quiet product look empty. It draws the same count the Tickets column shows,
 * because every number the report returns is already inside the window it was asked for.
 */
export function RecurringIssuesPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('by');
  const by: RecurringGroupBy = isGrouping(raw) ? raw : RECURRING_GROUP_BY.MODULE;
  const query = useRecurringReportQuery({ by, windowDays: WINDOW_DAYS });
  const busiest = Math.max(1, ...(query.data?.rows.map((row) => row.ticketCount) ?? [1]));

  const columns: TableColumn<RecurringGroupRow>[] = [
    {
      key: 'label',
      header: RECURRING_GROUP_BY_LABELS[by],
      render: (row) => <span className="task-cell__title">{row.label}</span>,
    },
    {
      key: 'clients',
      header: 'Clients',
      width: '100px',
      render: (row) => (
        <Badge tone={row.overThreshold ? 'danger' : 'neutral'}>{row.clientCount}</Badge>
      ),
    },
    { key: 'tickets', header: 'Tickets', width: '90px', render: (row) => row.ticketCount },
    {
      key: 'frequency',
      header: `Last ${WINDOW_DAYS} days`,
      hideOnMobile: true,
      render: (row) => (
        <span
          className="recurring-bar"
          role="img"
          aria-label={`${row.ticketCount} in the last ${WINDOW_DAYS} days`}
          style={{ display: 'block' }}
        >
          <span
            className={`recurring-bar__fill${row.overThreshold ? ' recurring-bar__fill--over' : ''}`}
            style={{ width: `${Math.round((row.ticketCount / busiest) * 100)}%` }}
          />
        </span>
      ),
    },
    {
      key: 'problems',
      header: 'Problems',
      width: '220px',
      render: (row) =>
        row.problems.length === 0 ? (
          <span className="muted">None open</span>
        ) : (
          <span className="problem-page__facts">
            {row.problems.map((problem) => (
              <Link key={problem.id} to={`/problems/${problem.id}`}>
                {problem.key} · {PROBLEM_STATUS_LABELS[problem.status]}
              </Link>
            ))}
          </span>
        ),
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Recurring issues"
        subtitle={
          query.data
            ? `Client counts are separate companies, never tickets · threshold ${query.data.threshold}`
            : undefined
        }
      >
        <SegmentedControl
          aria-label="Group by"
          size="sm"
          value={by}
          onChange={(next) => setParams({ by: next }, { replace: true })}
          options={GROUPINGS.map((key) => ({ key, label: RECURRING_GROUP_BY_LABELS[key] }))}
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
            aria-label="Recurring issues"
            columns={columns}
            rows={query.data.rows}
            rowKey={(row) => row.label}
            empty={
              <EmptyState
                title="Nothing is recurring"
                description="No group of tickets has been reported by more than one client yet."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
