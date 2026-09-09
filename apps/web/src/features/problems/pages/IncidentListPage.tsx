import {
  INCIDENT_STATUS,
  INCIDENT_STATUS_LABELS,
  type IncidentStatus,
  type IncidentSummary,
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
import { useIncidentsQuery } from '../incident-api';
import { durationLabel, incidentTone } from '../problem-display';

import '../problems.css';

type View = 'live' | 'resolved' | 'all';

const VIEWS: Record<View, { label: string; statuses?: IncidentStatus[] }> = {
  live: {
    label: 'Live',
    statuses: [
      INCIDENT_STATUS.OPEN,
      INCIDENT_STATUS.INVESTIGATING,
      INCIDENT_STATUS.IDENTIFIED,
      INCIDENT_STATUS.MONITORING,
    ],
  },
  resolved: {
    label: 'Resolved',
    statuses: [INCIDENT_STATUS.RESOLVED, INCIDENT_STATUS.CLOSED],
  },
  all: { label: 'All' },
};

function isView(value: string | null): value is View {
  return value !== null && value in VIEWS;
}

/** Incidents, worst first. An open Critical belongs at the top whoever is looking. */
export function IncidentListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: View = isView(raw) ? raw : 'live';
  const query = useIncidentsQuery({ status: VIEWS[view].statuses });

  const columns: TableColumn<IncidentSummary>[] = [
    {
      key: 'title',
      header: 'Incident',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">{row.key}</span>
          <span className="task-cell__title">{row.title}</span>
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'Severity',
      width: '110px',
      render: (row) => <PriorityDot priority={row.severity} showLabel />,
    },
    {
      key: 'impact',
      header: 'Impact',
      hideOnMobile: true,
      render: (row) => row.impact ?? <span className="muted">—</span>,
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '110px',
      render: (row) => durationLabel(row.durationMinutes),
    },
    {
      key: 'emergency',
      header: 'Emergency fix',
      hideOnMobile: true,
      width: '140px',
      render: (row) =>
        row.emergencyFixStatus === 'NONE' ? (
          <span className="muted">—</span>
        ) : (
          <Badge tone={row.emergencyFixStatus === 'APPROVED' ? 'danger' : 'warning'}>
            {row.emergencyFixStatus}
          </Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '170px',
      render: (row) => (
        <StatusPill tone={incidentTone(row.status)} label={INCIDENT_STATUS_LABELS[row.status]} />
      ),
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Incidents"
        subtitle={query.data ? `${query.data.total} in this view` : undefined}
      >
        <SegmentedControl
          aria-label="Incident view"
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
            aria-label="Incidents"
            columns={columns}
            rows={query.data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => void navigate(`/incidents/${row.id}`)}
            empty={
              <EmptyState
                title="Nothing is broken"
                description="An incident is opened when something is failing right now."
              />
            }
          />
        ) : null}
      </QueryState>
    </div>
  );
}
