import {
  PERMISSIONS,
  PROJECT_HEALTH_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type ProjectSummary,
} from '@ashniva/types';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  SegmentedControl,
  StatusPill,
  Table,
  type TableColumn,
} from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useProjectsQuery } from '../api';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { ProjectWorkPlanModal } from '../components/ProjectWorkPlanModal';

const HEALTH_TONE = { ON_TRACK: 'success', AT_RISK: 'warning', DELAYED: 'danger' } as const;

/** Project list with progress, health, open tasks and delivery date. */
export function ProjectsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = usePermission(PERMISSIONS.PROJECT_MANAGE);
  const [creating, setCreating] = useState(false);
  const [summaryId, setSummaryId] = useState<{ id: string; name: string } | null>(null);
  const scope = params.get('scope') === 'mine' ? 'mine' : 'all';
  const search = params.get('search') ?? '';
  const projects = useProjectsQuery({
    mine: scope === 'mine' || undefined,
    search: search || undefined,
  });

  const columns: TableColumn<ProjectSummary>[] = [
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
      key: 'client',
      header: 'Client',
      hideOnMobile: true,
      width: '170px',
      render: (project) =>
        project.clientOrganization?.name ?? <span className="muted">Internal</span>,
    },
    {
      key: 'type',
      header: 'Type',
      hideOnMobile: true,
      width: '150px',
      render: (project) => PROJECT_TYPE_LABELS[project.type],
    },
    {
      key: 'lead',
      header: 'Senior',
      hideOnMobile: true,
      width: '120px',
      render: (project) => project.lead?.name ?? '—',
    },
    {
      key: 'open',
      header: 'Open',
      width: '70px',
      align: 'right',
      render: (project) => project.taskCounts.open,
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '90px',
      align: 'right',
      render: (project) => `${project.progressPercent}%`,
    },
    {
      key: 'target',
      header: 'Delivery',
      hideOnMobile: true,
      width: '100px',
      render: (project) => formatDate(project.targetDate),
    },
    {
      key: 'health',
      header: 'Health',
      width: '120px',
      render: (project) =>
        project.status === 'ACTIVE' ? (
          <StatusPill
            tone={HEALTH_TONE[project.health]}
            label={PROJECT_HEALTH_LABELS[project.health]}
          />
        ) : (
          <StatusPill tone="neutral" label={PROJECT_STATUS_LABELS[project.status]} />
        ),
    },
  ];

  if (canManage) {
    columns.push({
      key: 'summary',
      header: 'Summary',
      width: '110px',
      align: 'right',
      render: (project) => (
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setSummaryId({ id: project.id, name: project.name });
          }}
        >
          Summary
        </Button>
      ),
    });
  }

  return (
    <div className="tasks-page">
      <PageHeader
        title="Projects"
        subtitle={projects.data ? `${projects.data.length} projects` : undefined}
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              + New project
            </Button>
          ) : undefined
        }
      >
        <SegmentedControl
          aria-label="Scope"
          size="sm"
          value={scope}
          onChange={(value) =>
            setParams(value === 'mine' ? { scope: 'mine' } : {}, { replace: true })
          }
          options={[
            { key: 'all', label: 'All projects' },
            { key: 'mine', label: 'My projects' },
          ]}
        />
        <Input
          type="search"
          aria-label="Search projects"
          placeholder="Search projects…"
          defaultValue={search}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              const next = new URLSearchParams(params);
              next.set('search', (event.target as HTMLInputElement).value);
              setParams(next, { replace: true });
            }
          }}
        />
      </PageHeader>
      <QueryState
        isLoading={projects.isLoading}
        isError={projects.isError}
        error={projects.error}
        onRetry={() => void projects.refetch()}
      >
        {projects.data ? (
          <Table
            aria-label="Projects"
            columns={columns}
            rows={projects.data}
            rowKey={(project) => project.id}
            onRowClick={(project) => void navigate(`/projects/${project.id}`)}
            empty={<EmptyState title="No projects" />}
          />
        ) : null}
      </QueryState>
      <ProjectFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(project) => void navigate(`/projects/${project.id}`)}
      />
      {summaryId ? (
        <ProjectWorkPlanModal
          projectId={summaryId.id}
          projectName={summaryId.name}
          onClose={() => setSummaryId(null)}
        />
      ) : null}
    </div>
  );
}
