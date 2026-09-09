import { PROJECT_STATUS_LABELS, type PortalProjectSummary } from '@ashniva/types';
import { EmptyState, Meter, PageHeader, StatusPill, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { usePortalProjectsQuery } from '../api';

/** Client project list: progress and delivery date only — no internal health, estimates or cost. */
export function PortalProjectsPage() {
  const navigate = useNavigate();
  const projects = usePortalProjectsQuery();

  const columns: TableColumn<PortalProjectSummary>[] = [
    {
      key: 'project',
      header: 'Project',
      render: (project) => (
        <div className="task-cell">
          <span className="task-cell__key">{project.code}</span>
          <span className="task-cell__title">{project.name}</span>
        </div>
      ),
    },
    {
      key: 'manager',
      header: 'Your contact',
      hideOnMobile: true,
      width: '160px',
      render: (project) => project.manager?.name ?? '—',
    },
    {
      key: 'inProgress',
      header: 'In progress',
      width: '100px',
      align: 'right',
      render: (project) => project.taskCounts.inProgress,
    },
    {
      key: 'completed',
      header: 'Completed',
      hideOnMobile: true,
      width: '100px',
      align: 'right',
      render: (project) => `${project.taskCounts.completed} / ${project.taskCounts.total}`,
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '150px',
      render: (project) => (
        <Meter
          percent={project.progressPercent}
          label={`Progress on ${project.name}`}
          valueText={`${project.taskCounts.completed} of ${project.taskCounts.total} items done`}
          size="sm"
        />
      ),
    },
    {
      key: 'target',
      header: 'Delivery',
      hideOnMobile: true,
      width: '100px',
      render: (project) => formatDate(project.targetDate),
    },
    {
      key: 'updated',
      header: 'Last update',
      hideOnMobile: true,
      width: '110px',
      render: (project) => (
        <span className="muted">
          {project.lastUpdateAt ? formatRelative(project.lastUpdateAt) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (project) => (
        <StatusPill
          tone={project.status === 'ACTIVE' ? 'success' : 'neutral'}
          label={PROJECT_STATUS_LABELS[project.status]}
        />
      ),
    },
  ];

  return (
    <div className="list-page">
      <PageHeader
        title="Your projects"
        subtitle={projects.data ? `${projects.data.length} projects` : undefined}
      />
      <QueryState
        isLoading={projects.isLoading}
        isError={projects.isError}
        error={projects.error}
        onRetry={() => void projects.refetch()}
        loadingFallback={
          <Table
            aria-label="Your projects"
            columns={columns}
            rows={[]}
            rowKey={(project) => project.id}
            loading
          />
        }
      >
        {projects.data ? (
          <Table
            aria-label="Your projects"
            columns={columns}
            rows={projects.data}
            rowKey={(project) => project.id}
            onRowClick={(project) => void navigate(`/portal/projects/${project.id}`)}
            empty={<EmptyState title="No projects yet" />}
          />
        ) : null}
      </QueryState>
    </div>
  );
}
