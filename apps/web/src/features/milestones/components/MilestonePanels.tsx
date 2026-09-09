import { MILESTONE_STATUS, type MilestoneDetail } from '@ashniva/types';
import { Badge, Card, DescriptionList, EmptyState, type DescriptionItem } from '@ashniva/ui';
import { Link } from 'react-router';

import { ApprovalStatusPill, TaskStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatDateTime } from '../../../shared/lib/format';

/** Client sign-off state of a milestone that needs one. */
export function ApprovalBadge({ status }: { status: string | null }) {
  if (!status) {
    return <Badge tone="warning">Needs client sign-off</Badge>;
  }
  return (
    <ApprovalStatusPill status={status as Parameters<typeof ApprovalStatusPill>[0]['status']} />
  );
}

interface DeliverablesCardProps {
  milestone: MilestoneDetail;
  canWork: boolean;
  onToggle: (deliverableId: string, isDone: boolean) => void;
}

export function DeliverablesCard({ milestone, canWork, onToggle }: DeliverablesCardProps) {
  const locked = !canWork || milestone.status === MILESTONE_STATUS.COMPLETED;
  return (
    <Card title="Deliverables">
      {milestone.deliverables.length === 0 ? (
        <EmptyState title="No deliverables listed" />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {milestone.deliverables.map((item) => (
            <li key={item.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="checkbox"
                id={`deliverable-${item.id}`}
                checked={item.isDone}
                disabled={locked}
                onChange={(event) => onToggle(item.id, event.target.checked)}
              />
              <label
                htmlFor={`deliverable-${item.id}`}
                className={item.isDone ? 'muted' : undefined}
              >
                {item.title}
                {item.doneAt ? (
                  <span className="timeline__note"> · done {formatDate(item.doneAt)}</span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LinkedTasksCard({ milestone }: { milestone: MilestoneDetail }) {
  return (
    <Card title="Linked tasks">
      {milestone.linkedTasks.length === 0 ? (
        <EmptyState
          title="No tasks linked"
          description="Set the milestone when creating or editing a task."
        />
      ) : (
        <ul className="timeline">
          {milestone.linkedTasks.map((task) => (
            <li
              key={task.id}
              className="timeline__item"
              style={{ gridTemplateColumns: '90px 1fr auto' }}
            >
              <Link to={`/tasks/${task.id}`}>{task.key}</Link>
              <span>{task.title}</span>
              <TaskStatusPill
                status={task.status as Parameters<typeof TaskStatusPill>[0]['status']}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MilestoneHistoryCard({ milestone }: { milestone: MilestoneDetail }) {
  return (
    <Card title="History">
      <ul className="timeline">
        {milestone.history.map((entry) => (
          <li key={entry.id} className="timeline__item">
            <span className="timeline__when">{formatDateTime(entry.createdAt)}</span>
            <span>
              {entry.kind.toLowerCase()}
              {entry.fromValue || entry.toValue
                ? `: ${entry.fromValue ?? ''} → ${entry.toValue ?? ''}`
                : ''}
              <span className="timeline__note">
                {' '}
                · {entry.changedBy.name}
                {entry.reason ? ` · ${entry.reason}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function MilestoneDetailsCard({ milestone }: { milestone: MilestoneDetail }) {
  return (
    <Card title="Details">
      <DescriptionList items={detailItems(milestone)} />
    </Card>
  );
}

/** The Details rows. Change request appears only on a milestone that came from one. */
function detailItems(milestone: MilestoneDetail): DescriptionItem[] {
  const items: DescriptionItem[] = [
    {
      key: 'project',
      term: 'Project',
      description: <Link to={`/projects/${milestone.project.id}`}>{milestone.project.name}</Link>,
    },
    {
      key: 'contract',
      term: 'Contract',
      description: milestone.contract ? (
        <Link to={`/contracts/${milestone.contract.id}`}>{milestone.contract.number}</Link>
      ) : (
        '—'
      ),
    },
    { key: 'owner', term: 'Owner', description: milestone.owner?.name ?? '—' },
    {
      key: 'dates',
      term: 'Dates',
      description: `${formatDate(milestone.startDate)} → ${formatDate(milestone.dueDate)}`,
    },
    {
      key: 'depends-on',
      term: 'Depends on',
      description: <MilestoneLinks to={milestone.dependsOn} />,
    },
    {
      key: 'unblocks',
      term: 'Unblocks',
      description: <MilestoneLinks to={milestone.dependents} />,
    },
  ];
  if (milestone.changeRequest) {
    items.push({
      key: 'change-request',
      term: 'Change request',
      description: (
        <Link to={`/change-requests/${milestone.changeRequest.id}`}>
          {milestone.changeRequest.number}
        </Link>
      ),
    });
  }
  items.push({
    key: 'completed',
    term: 'Completed',
    description: formatDate(milestone.completedAt),
  });
  return items;
}

/** A list of milestones as links, one per line, or an em dash when there are none. */
function MilestoneLinks({ to }: { to: { id: string; name: string }[] }) {
  if (to.length === 0) {
    return <>—</>;
  }
  return (
    <>
      {to.map((entry) => (
        <div key={entry.id}>
          <Link to={`/milestones/${entry.id}`}>{entry.name}</Link>
        </div>
      ))}
    </>
  );
}
