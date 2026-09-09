import {
  PHASE1_TASK_STATUSES,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  type TaskStatus,
  type TaskSummary,
} from '@ashniva/types';
import { Avatar, Badge, EmptyState, PriorityDot, Skeleton, TASK_STATUS_TONES } from '@ashniva/ui';
import { Link } from 'react-router';

import { describeDue } from '../../../shared/lib/format';
import { TaskTimingBadge } from './TaskTimingBadge';

const COLUMNS: readonly TaskStatus[] = PHASE1_TASK_STATUSES.filter(
  (status) => status !== TASK_STATUS.DRAFT && status !== TASK_STATUS.CANCELLED,
);

/** Kanban-style board: one column per Phase 1 status, cards link to the task. */
export function TaskBoard({ tasks, loading = false }: { tasks: TaskSummary[]; loading?: boolean }) {
  if (loading) {
    return <TaskBoardSkeleton />;
  }
  if (tasks.length === 0) {
    return (
      <EmptyState title="No tasks match" description="Try another view or clear the filters." />
    );
  }
  const extra = tasks.filter((task) => !COLUMNS.includes(task.status));
  return (
    <div className="task-board">
      {COLUMNS.map((status) => {
        const column = tasks.filter((task) => task.status === status);
        return (
          <section
            key={status}
            className={`task-board__column ui-tone--${TASK_STATUS_TONES[status]}`}
            aria-label={TASK_STATUS_LABELS[status]}
          >
            <header className="task-board__header">
              {TASK_STATUS_LABELS[status]}
              <span>{column.length}</span>
            </header>
            <div className="task-board__cards">
              {column.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>
        );
      })}
      {extra.length > 0 ? (
        <section className="task-board__column" aria-label="Other">
          <header className="task-board__header">
            Other <span>{extra.length}</span>
          </header>
          <div className="task-board__cards">
            {extra.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function TaskCard({ task }: { task: TaskSummary }) {
  return (
    <Link to={`/tasks/${task.id}`} className="task-card">
      <span className="task-card__key">
        <PriorityDot priority={task.priority} />
        {task.key}
        {task.clientVisible ? <Badge tone="success">Client</Badge> : null}
      </span>
      <span className="task-card__title">{task.title}</span>
      <span className="task-card__meta">
        {task.assignedTo ? (
          <span className="task-card__person">
            <Avatar name={task.assignedTo.name} size="sm" />
            {task.assignedTo.name}
          </span>
        ) : (
          <span>Unassigned</span>
        )}
        <span className={task.isOverdue ? 'due--overdue' : ''}>
          {describeDue(task.dueDate, task.isOverdue)}
          {/*
            Compact: the phrase to its left already carries the number. A card with no expected
            completion time gets no badge at all — the component decides that, not this call site.
          */}{' '}
          <TaskTimingBadge timing={task.timing} compact />
        </span>
      </span>
    </Link>
  );
}

/**
 * The board's own shape while it loads.
 *
 * The board is the default layout and every view chip refetches, so without this the whole page
 * collapses to a spinner and springs back on each press. Three columns of two cards is enough to
 * read as "a board is coming" without pretending to know how many there will be.
 */
function TaskBoardSkeleton() {
  return (
    <div className="task-board" aria-hidden="true">
      {COLUMNS.slice(0, 4).map((status) => (
        <section key={status} className="task-board__column">
          <header className="task-board__header">{TASK_STATUS_LABELS[status]}</header>
          <div className="task-board__cards">
            {[0, 1].map((index) => (
              <div className="task-card" key={index}>
                <Skeleton width="4.5rem" height="var(--font-size-xs)" />
                <Skeleton />
                <Skeleton width="70%" height="var(--font-size-xs)" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
