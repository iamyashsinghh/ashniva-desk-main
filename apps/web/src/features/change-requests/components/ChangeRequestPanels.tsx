import {
  CHANGE_REQUEST_STATUS_LABELS,
  type ChangeRequestDetail,
  type ChangeRequestHistoryEntry,
  type PortalChangeRequestDetail,
} from '@ashniva/types';
import { Badge, Card, DescriptionList, EmptyState } from '@ashniva/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { formatDate, formatDateTime, formatMinutes } from '../../../shared/lib/format';
import { formatCost } from '../format';

type AnyDetail = ChangeRequestDetail | PortalChangeRequestDetail;

/** The request as written: what, why, scope and impact (shared by both sides). */
export function ChangeRequestOverview({ cr }: { cr: AnyDetail }) {
  return (
    <Card title="The request" headerAddon={<Badge tone="success">Client-visible</Badge>}>
      <p className="prose">{cr.description}</p>
      <DescriptionList
        items={[
          {
            key: 'business-reason',
            term: 'Business reason',
            description: cr.businessReason ?? '—',
          },
          { key: 'scope', term: 'Scope', description: cr.scope ?? '—' },
          { key: 'impact', term: 'Impact', description: cr.impact ?? '—' },
        ]}
      />
      {cr.decisionNote ? (
        <p className="prose" style={{ marginTop: 10 }}>
          <strong>Decision note:</strong> {cr.decisionNote}
        </p>
      ) : null}
    </Card>
  );
}

/** Estimate, cost and timeline impact — the numbers the client is asked to approve. */
export function ChangeRequestImpact({ cr, actions }: { cr: AnyDetail; actions?: ReactNode }) {
  const empty =
    cr.estimatedMinutes === null && cr.costImpact === null && cr.timelineImpactDays === null;
  return (
    <Card title="Estimate and impact" headerAddon={actions}>
      {empty ? (
        <EmptyState
          title="Not estimated yet"
          description="The provider adds effort, cost and timeline impact during internal review."
        />
      ) : (
        <DescriptionList
          items={[
            {
              key: 'effort',
              term: 'Effort',
              description: cr.estimatedMinutes !== null ? formatMinutes(cr.estimatedMinutes) : '—',
            },
            {
              key: 'cost-impact',
              term: 'Cost impact',
              description: formatCost(cr.costImpact, cr.currency),
            },
            {
              key: 'timeline-impact',
              term: 'Timeline impact',
              description:
                cr.timelineImpactDays !== null
                  ? `${cr.timelineImpactDays} day${cr.timelineImpactDays === 1 ? '' : 's'}`
                  : '—',
            },
            {
              key: 'scheduled-for',
              term: 'Scheduled for',
              description: formatDate(cr.scheduledFor),
            },
          ]}
        />
      )}
    </Card>
  );
}

/** Tasks and milestones created from an approved change (internal only: keys link to tasks). */
export function ChangeRequestLinkedWork({ cr }: { cr: ChangeRequestDetail }) {
  if (cr.linkedTasks.length === 0 && cr.milestones.length === 0) {
    return null;
  }
  return (
    <Card title="Work created from this change">
      {cr.milestones.length > 0 ? (
        <p className="muted" style={{ marginBottom: 8 }}>
          Milestones:{' '}
          {cr.milestones.map((milestone, index) => (
            <span key={milestone.id}>
              {index > 0 ? ', ' : ''}
              <Link to={`/milestones/${milestone.id}`}>{milestone.name}</Link>
            </span>
          ))}
        </p>
      ) : null}
      <ul className="update-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {cr.linkedTasks.map((task) => (
          <li key={task.id} className="update-list__item">
            <Link to={`/tasks/${task.id}`}>
              <strong>{task.key}</strong> {task.title}
            </Link>
            <span className="muted"> · {task.status}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ChangeRequestHistory({ history }: { history: ChangeRequestHistoryEntry[] }) {
  if (history.length === 0) {
    return <EmptyState title="No history yet" />;
  }
  return (
    <ul className="timeline">
      {history.map((entry) => (
        <li key={entry.id} className="timeline__item">
          <span className="timeline__when">{formatDateTime(entry.createdAt)}</span>
          <span>
            {CHANGE_REQUEST_STATUS_LABELS[entry.toStatus]}
            <span className="timeline__note">
              {' '}
              · {entry.changedBy.name}
              {entry.note ? ` · “${entry.note}”` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
