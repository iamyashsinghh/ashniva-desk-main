import type { MilestoneSummary, PortalMilestoneSummary } from '@ashniva/types';
import { Badge, EmptyState, Meter, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { ApprovalStatusPill, MilestoneStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';

/**
 * Thin progress bar reused by the milestone tables and detail pages.
 *
 * A `Meter` now rather than eight lines of markup borrowing `.workload__bar` from the dashboard's
 * stylesheet — a cross-feature reach that also carried the dashboard's mistake: the bar was
 * `aria-hidden` with the number in a sibling `<strong>`, so assistive technology got a percentage
 * with nothing to say what it measured. `label` is what fixes that, and it is required.
 */
export function ProgressBar({
  percent,
  warn = false,
  label = 'Progress',
}: {
  percent: number;
  warn?: boolean;
  /** What is being measured, e.g. "Progress on Phase 2". Read out with the value. */
  label?: string;
}) {
  return <Meter percent={percent} label={label} warn={warn} />;
}

function approvalPill(status: string | null) {
  return status ? (
    <ApprovalStatusPill status={status as Parameters<typeof ApprovalStatusPill>[0]['status']} />
  ) : null;
}

function VisibilityBadge({ clientVisible }: { clientVisible: boolean }) {
  return clientVisible ? (
    <Badge tone="success">Client</Badge>
  ) : (
    <Badge tone="neutral">Internal</Badge>
  );
}

export function MilestoneTable({
  milestones,
  showProject = true,
  emptyTitle = 'No milestones yet',
  showVisibility = true,
  /** Detail route prefix; null makes the rows read-only (the portal has no milestone page). */
  linkBase = '/milestones',
}: {
  milestones: MilestoneSummary[];
  showProject?: boolean;
  emptyTitle?: string;
  showVisibility?: boolean;
  linkBase?: string | null;
}) {
  const navigate = useNavigate();
  const columns: TableColumn<MilestoneSummary>[] = [
    {
      key: 'name',
      header: 'Milestone',
      render: (row) => (
        <div className="task-cell">
          <span className="task-cell__key">
            {row.name}
            {showVisibility ? <VisibilityBadge clientVisible={row.clientVisible} /> : null}
          </span>
          <span className="task-cell__title">
            {showProject ? `${row.project.code} · ` : ''}
            {row.deliverablesDone}/{row.deliverableCount} deliverables · {row.linkedTasksCompleted}/
            {row.linkedTaskCount} tasks
            {row.owner ? ` · ${row.owner.name}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '180px',
      render: (row) => (
        <ProgressBar
          percent={row.progressPercent}
          warn={row.isOverdue}
          label={`Progress on ${row.name}`}
        />
      ),
    },
    {
      key: 'due',
      header: 'Due',
      width: '110px',
      hideOnMobile: true,
      render: (row) => (
        <span className={row.isOverdue ? 'due--overdue' : undefined}>
          {formatDate(row.dueDate)}
        </span>
      ),
    },
    {
      key: 'approval',
      header: 'Approval',
      width: '140px',
      hideOnMobile: true,
      render: (row) =>
        row.requiresApproval ? (
          (approvalPill(row.approvalStatus) ?? <span className="muted">Not requested</span>)
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (row) => <MilestoneStatusPill status={row.status} />,
    },
  ];
  return (
    <Table
      aria-label="Milestones"
      columns={columns}
      rows={milestones}
      rowKey={(row) => row.id}
      onRowClick={linkBase ? (row) => void navigate(`${linkBase}/${row.id}`) : undefined}
      empty={<EmptyState title={emptyTitle} />}
    />
  );
}

/** Portal list: client-visible milestones with progress, deliverables and approval state. */
export function PortalMilestoneList({ milestones }: { milestones: PortalMilestoneSummary[] }) {
  if (milestones.length === 0) {
    return <EmptyState title="No milestones shared yet" />;
  }
  return (
    <div className="update-list">
      {milestones.map((milestone) => (
        <div key={milestone.id} className="update-list__item">
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <strong>{milestone.name}</strong>
            <MilestoneStatusPill status={milestone.status} />
            {approvalPill(milestone.approvalStatus)}
          </span>
          <ProgressBar
            percent={milestone.progressPercent}
            label={`Progress on ${milestone.name}`}
          />
          <span className="update-list__meta">
            {milestone.project.name} · due {formatDate(milestone.dueDate)}
            {milestone.completedAt ? ` · completed ${formatDate(milestone.completedAt)}` : ''}
          </span>
          {milestone.deliverables.length > 0 ? (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {milestone.deliverables.map((item) => (
                <li key={item.id} className={item.isDone ? 'muted' : undefined}>
                  {item.isDone ? '✓ ' : ''}
                  {item.title}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
