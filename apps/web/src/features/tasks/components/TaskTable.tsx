import type { TaskSummary } from '@ashniva/types';
import { Avatar, Badge, EmptyState, PriorityDot, Table, type TableColumn } from '@ashniva/ui';
import { useNavigate } from 'react-router';

import { TaskStatusPill } from '../../../shared/components/StatusPills';
import { TaskTimingBadge } from './TaskTimingBadge';
import { describeDue, formatMinutes } from '../../../shared/lib/format';

interface TaskTableProps {
  tasks: TaskSummary[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** Hide the assignee column on personal lists. */
  showAssignee?: boolean;
  showProject?: boolean;
  /** Placeholder rows instead of a spinner, so the page does not move while the list reloads. */
  loading?: boolean;
  /** Denser rows for lists that are read by comparison rather than one row at a time. */
  density?: 'comfortable' | 'compact';
}

/** The task list used by dashboards, the task list view and project tabs. */
export function TaskTable({
  tasks,
  emptyTitle = 'No tasks',
  emptyDescription,
  showAssignee = true,
  showProject = true,
  loading = false,
  density = 'comfortable',
}: TaskTableProps) {
  const navigate = useNavigate();
  const columns: TableColumn<TaskSummary>[] = [
    {
      key: 'task',
      header: 'Task',
      render: (task) => (
        <div className="task-cell">
          <span className="task-cell__key">
            <PriorityDot priority={task.priority} />
            {task.key}
          </span>
          <span className="task-cell__title">
            {task.title}
            {task.clientVisible ? <Badge tone="success">Client</Badge> : null}
          </span>
        </div>
      ),
    },
    ...(showProject
      ? [
          {
            key: 'project',
            header: 'Project',
            render: (task: TaskSummary) => task.project.name,
            hideOnMobile: true,
            width: '180px',
          },
        ]
      : []),
    ...(showAssignee
      ? [
          {
            key: 'assignee',
            header: 'Assignee',
            render: (task: TaskSummary) =>
              task.assignedTo ? (
                <span className="task-cell__person">
                  <Avatar name={task.assignedTo.name} size="sm" />
                  {task.assignedTo.name}
                </span>
              ) : (
                <span className="muted">Unassigned</span>
              ),
            hideOnMobile: true,
            width: '170px',
          },
        ]
      : []),
    {
      key: 'due',
      header: 'Due',
      width: '160px',
      nowrap: true,
      render: (task) => (
        <span className={task.isOverdue ? 'due due--overdue' : 'due'}>
          {describeDue(task.dueDate, task.isOverdue)}{' '}
          {/*
            No guard here: "a task with no expected completion time gets no badge" is the badge's
            own rule, and it was restated at this one call site while the board and the detail
            screen — which now render it too — would each have had to restate it again.
          */}
          <TaskTimingBadge timing={task.timing} />
        </span>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      width: '90px',
      align: 'right',
      nowrap: true,
      hideOnMobile: true,
      render: (task) =>
        task.loggedMinutes > 0 ? (
          formatMinutes(task.loggedMinutes)
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '150px',
      render: (task) => <TaskStatusPill status={task.status} />,
    },
  ];
  return (
    <Table
      aria-label="Tasks"
      columns={columns}
      rows={tasks}
      rowKey={(task) => task.id}
      onRowClick={(task) => void navigate(`/tasks/${task.id}`)}
      loading={loading}
      density={density}
      empty={<EmptyState title={emptyTitle} description={emptyDescription} />}
    />
  );
}
