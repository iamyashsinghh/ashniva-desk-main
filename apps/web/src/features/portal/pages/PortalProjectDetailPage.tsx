import { PROJECT_STATUS_LABELS, type PortalProjectDetail } from '@ashniva/types';
import { Badge, Card, EmptyState, Kpi, KpiGrid, PageHeader, Tabs } from '@ashniva/ui';
import { Link, useParams, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate, formatRelative } from '../../../shared/lib/format';
import { FileLink } from '../../files/components/FileLink';
import { usePortalProjectQuery } from '../api';
import { PortalMilestoneList } from '../../milestones/components/MilestoneTable';
import { PortalPlanPanel } from '../components/PortalPlanPanel';
import { PortalProgressPanel } from '../components/PortalProgressPanel';
import { PortalTaskRows } from '../components/PortalTaskRows';

import '../../dashboard/dashboard.css';
import '../../tasks/tasks.css';

type Tab = 'overview' | 'progress' | 'tasks' | 'milestones' | 'updates' | 'files';

/** Client project detail: client-visible tasks, published updates and shared files only. */
export function PortalProjectDetailPage() {
  const { id } = useParams();
  const query = usePortalProjectQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <ProjectBody project={query.data} /> : null}
    </QueryState>
  );
}

function ProjectBody({ project }: { project: PortalProjectDetail }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'overview') as Tab;

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/portal/projects">Projects</Link> / {project.code}
          </>
        }
        title={project.name}
        subtitle={`${PROJECT_STATUS_LABELS[project.status]} · delivery ${formatDate(project.targetDate)}`}
      >
        <Tabs
          aria-label="Project sections"
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          items={[
            { key: 'overview', label: 'Overview' },
            { key: 'progress', label: 'Progress' },
            { key: 'tasks', label: 'Work items', count: project.tasks.length },
            { key: 'milestones', label: 'Milestones', count: project.milestones.length },
            { key: 'updates', label: 'Updates', count: project.updates.length },
            { key: 'files', label: 'Files', count: project.files.length },
          ]}
        />
      </PageHeader>

      {tab === 'overview' ? (
        <>
          <KpiGrid>
            <Kpi label="Progress" value={`${project.progressPercent}%`} />
            <Kpi label="In progress" value={project.taskCounts.inProgress} />
            <Kpi label="Completed" value={project.taskCounts.completed} />
            <Kpi label="Open tickets" value={project.openTicketCount} />
            <Kpi label="Started" value={formatDate(project.startDate)} />
            <Kpi label="Delivery" value={formatDate(project.targetDate)} />
          </KpiGrid>
          <div className="dashboard__grid dashboard__grid--equal">
            <Card title="Scope">
              <p className="prose">{project.description?.trim() || 'No description shared yet.'}</p>
            </Card>
            <Card title="Your contact">
              <dl className="kv">
                <dt>Project manager</dt>
                <dd>{project.manager?.name ?? 'To be confirmed'}</dd>
                <dt>Last update</dt>
                <dd>{project.lastUpdateAt ? formatRelative(project.lastUpdateAt) : '—'}</dd>
              </dl>
            </Card>
          </div>
        </>
      ) : null}
      {/* Its own query, made only while this tab is open. */}
      {tab === 'progress' ? <PortalProgressPanel projectId={project.id} /> : null}
      {tab === 'tasks' ? (
        <PortalTaskRows tasks={project.tasks} emptyTitle="No work items shared for this project" />
      ) : null}
      {tab === 'milestones' ? (
        <>
          {/* The plan is its own request, made only while this tab is open. */}
          <PortalPlanPanel projectId={project.id} enabled />
          <Card
            title="Milestones"
            headerAddon={<span className="muted">progress comes from the linked work</span>}
          >
            <PortalMilestoneList milestones={project.milestones} />
          </Card>
        </>
      ) : null}
      {tab === 'updates' ? (
        <Card title="Updates" headerAddon={<Badge tone="success">Published by your team</Badge>}>
          {project.updates.length === 0 ? (
            <EmptyState
              title="No updates yet"
              description="Completed work appears here once it is published."
            />
          ) : (
            <div className="update-list">
              {project.updates.map((update) => (
                <div key={update.id} className="update-list__item">
                  <span>{update.title}</span>
                  <span className="update-list__meta">{formatDate(update.workDate)}</span>
                  <span>{update.body}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}
      {tab === 'files' ? (
        <Card title="Files shared with you">
          {project.files.length === 0 ? (
            <EmptyState title="No files shared yet" />
          ) : (
            <ul className="update-list">
              {project.files.map((file) => (
                <li key={file.id} className="update-list__item">
                  <FileLink file={file} />
                  <span className="update-list__meta">
                    {Math.max(1, Math.round(file.sizeBytes / 1024))} KB ·{' '}
                    {formatRelative(file.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
