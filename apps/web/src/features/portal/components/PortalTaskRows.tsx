import type { PortalTaskSummary } from '@ashniva/types';
import { EmptyState, PriorityDot, Table, type TableColumn } from '@ashniva/ui';

import { ClientStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatRelative } from '../../../shared/lib/format';

interface PortalTaskRowsProps {
  tasks: PortalTaskSummary[];
  emptyTitle?: string;
  /** Placeholder rows instead of a spinner, so the page holds still while the view changes. */
  loading?: boolean;
}

/** Client-facing work items: client-visible status, no assignee, estimate or internal notes. */
export function PortalTaskRows({
  tasks,
  emptyTitle = 'No work items',
  loading = false,
}: PortalTaskRowsProps) {
  const columns: TableColumn<PortalTaskSummary>[] = [
    {
      key: 'task',
      header: 'Work item',
      render: (task) => (
        <div className="task-cell">
          <span className="task-cell__key">{task.key}</span>
          <span className="task-cell__title">{task.title}</span>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      hideOnMobile: true,
      width: '110px',
      render: (task) => <PriorityDot priority={task.priority} showLabel />,
    },
    {
      key: 'due',
      header: 'Expected',
      hideOnMobile: true,
      width: '100px',
      render: (task) => formatDate(task.dueDate),
    },
    {
      key: 'updated',
      header: 'Updated',
      width: '90px',
      render: (task) => (
        <span className="muted">
          {task.completedAt ? formatDate(task.completedAt) : formatRelative(task.updatedAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '170px',
      render: (task) => <ClientStatusPill status={task.status} />,
    },
  ];
  return (
    <Table
      aria-label="Work items"
      columns={columns}
      rows={tasks}
      rowKey={(task) => task.id}
      loading={loading}
      empty={<EmptyState title={emptyTitle} />}
    />
  );
}
