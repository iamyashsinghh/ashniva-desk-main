import { PROJECT_HEALTH_LABELS, type ProjectDetail } from '@ashniva/types';
import { Badge, Card, Kpi, KpiGrid } from '@ashniva/ui';

import { formatDate } from '../../../shared/lib/format';

/** Scope, dates, people, health and the counts behind them, in one place. */
export function ProjectOverviewPanel({ project }: { project: ProjectDetail }) {
  return (
    <>
      <KpiGrid>
        <Kpi label="Progress" value={`${project.progressPercent}%`} />
        <Kpi
          label="Health"
          value={PROJECT_HEALTH_LABELS[project.health]}
          warn={project.health !== 'ON_TRACK'}
        />
        <Kpi label="Open tasks" value={project.taskCounts.open} />
        <Kpi label="In review" value={project.taskCounts.inReview} />
        <Kpi
          label="Overdue"
          value={project.taskCounts.overdue}
          warn={project.taskCounts.overdue > 0}
        />
        <Kpi
          label="Blocked"
          value={project.taskCounts.blocked}
          warn={project.taskCounts.blocked > 0}
        />
        <Kpi label="Open tickets" value={project.openTicketCount} />
        <Kpi label="Delivery" value={formatDate(project.targetDate)} />
      </KpiGrid>
      <div className="dashboard__grid dashboard__grid--equal">
        <Card title="Scope">
          <p className="prose">{project.description?.trim() || 'No description yet.'}</p>
        </Card>
        <Card title="People" headerAddon={<Badge tone="neutral">Internal</Badge>}>
          <dl className="kv">
            <dt>Manager</dt>
            <dd>{project.manager?.name ?? '—'}</dd>
            <dt>Senior / lead</dt>
            <dd>{project.lead?.name ?? '—'}</dd>
            <dt>Team</dt>
            <dd>{project.team?.name ?? '—'}</dd>
            <dt>Members</dt>
            <dd>{project.members.length}</dd>
            <dt>Client UAT</dt>
            <dd>{project.requiresClientUat ? 'Required' : 'Not required'}</dd>
            <dt>Started</dt>
            <dd>{formatDate(project.startDate)}</dd>
            <dt>Target delivery</dt>
            <dd>{formatDate(project.targetDate)}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
