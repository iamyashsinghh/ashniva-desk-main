import {
  PROJECT_HEALTH_LABELS,
  TASK_STATUS_LABELS,
  type ClientUpdateSummary,
  type ProjectSummary,
  type StatusCount,
  type WorkloadEntry,
} from '@ashniva/types';
import { Avatar, Card, EmptyState, Meter, Tooltip, VisuallyHidden } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatDate, formatMinutes } from '../../../shared/lib/format';

/** "Team workload" card: open tasks per person with overdue/blocked and time today. */
export function WorkloadCard({
  entries,
  title = 'Team workload',
}: {
  entries: WorkloadEntry[];
  title?: string;
}) {
  const max = Math.max(1, ...entries.map((entry) => entry.openTasks));
  return (
    <Card title={title} headerAddon={<span className="muted">open tasks · time today</span>}>
      {entries.length === 0 ? (
        <EmptyState title="No team members yet" />
      ) : (
        <div className="workload">
          {entries.map((entry) => (
            <div key={entry.user.id} className="workload__row">
              {/*
                The email stays on hover: it is how a manager tells two people apart here. A
                `Tooltip` rather than a `title`, so it is styled, dismissible with Escape, and part
                of the name's accessible description instead of a browser affordance that never
                appears on a touch device.
              */}
              <Tooltip content={entry.user.email}>
                <span className="workload__name">
                  <Avatar name={entry.user.name} size="sm" />
                  {entry.user.name}
                </span>
              </Tooltip>
              {/*
                The bar was aria-hidden with the numbers in a sibling span, so a screen reader got
                "6 open · 2 overdue" with nothing to say how that compared to anyone else. The
                meter carries the comparison, and `valueText` gives it the same words the sighted
                reader gets rather than a bare percentage of an invisible maximum.
              */}
              <Meter
                label={`Open tasks for ${entry.user.name}`}
                percent={Math.round((entry.openTasks / max) * 100)}
                valueText={describeWorkload(entry)}
                warn={entry.overdue > 0}
                showValue={false}
                size="sm"
              />
              <span className="workload__meta">{describeWorkload(entry)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** The one line that says how loaded somebody is, used by the bar and by the text beside it. */
function describeWorkload(entry: WorkloadEntry): string {
  return [
    `${entry.openTasks} open`,
    entry.overdue > 0 ? `${entry.overdue} overdue` : '',
    entry.blocked > 0 ? `${entry.blocked} blocked` : '',
    entry.minutesToday > 0 ? formatMinutes(entry.minutesToday) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ProjectsCard({
  projects,
  title = 'Projects',
}: {
  projects: ProjectSummary[];
  title?: string;
}) {
  return (
    <Card title={title}>
      {projects.length === 0 ? (
        <EmptyState title="No active projects" />
      ) : (
        <div className="project-list">
          {projects.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}`} className="project-list__row">
              {/*
                Decorative on purpose. Colour alone cannot carry "at risk", and the health *word*
                is already in the meta line on the same row — so the dot repeats it for the eye
                and stays out of the reading order rather than saying it twice.
              */}
              <span
                className={`project-list__dot project-list__dot--${project.health}`}
                aria-hidden="true"
              />
              <span>
                <span className="project-list__name">{project.name}</span>{' '}
                <span className="project-list__meta">
                  · {project.clientOrganization?.name ?? 'Internal'} ·{' '}
                  {PROJECT_HEALTH_LABELS[project.health]}
                  {project.taskCounts.overdue > 0 ? ` · ${project.taskCounts.overdue} overdue` : ''}
                  {project.taskCounts.blocked > 0 ? ` · ${project.taskCounts.blocked} blocked` : ''}
                </span>
              </span>
              <span className="project-list__meta">{project.openTicketCount} tickets</span>
              <strong>{project.progressPercent}%</strong>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function StatusBarsCard({ counts, title }: { counts: StatusCount[]; title: string }) {
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <Card title={title} headerAddon={<span className="muted">{total} open</span>}>
      {counts.length === 0 ? (
        <EmptyState title="Nothing in progress" />
      ) : (
        <div className="status-bars">
          {counts.map((entry) => (
            <div key={entry.status} className="status-bars__row">
              <span>{TASK_STATUS_LABELS[entry.status]}</span>
              <Meter
                label={`Share of open tasks in ${TASK_STATUS_LABELS[entry.status]}`}
                percent={Math.round((entry.count / total) * 100)}
                valueText={`${entry.count} of ${total}`}
                showValue={false}
                size="sm"
              />
              <strong>
                {entry.count}
                <VisuallyHidden> tasks</VisuallyHidden>
              </strong>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function UpdatesCard({
  updates,
  title = 'Updates waiting to publish',
}: {
  updates: ClientUpdateSummary[];
  title?: string;
}) {
  return (
    <Card title={title} headerAddon={<Link to="/completed-today">Open Completed Today</Link>}>
      {updates.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="Client-visible completions appear here until a senior publishes them."
        />
      ) : (
        <div className="update-list">
          {updates.map((update) => (
            <div key={update.id} className="update-list__item">
              <span>{update.title}</span>
              <span className="update-list__meta">
                {update.clientOrganization.name} · {update.project.name} ·{' '}
                {formatDate(update.workDate)} · by {update.author.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <h2 className="dashboard__section-title">
      {children}
      {hint ? <span>{hint}</span> : null}
    </h2>
  );
}
