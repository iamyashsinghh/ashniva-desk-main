import { PERMISSIONS, PRIORITY_LABELS, isTaskClosed, type TaskDetail } from '@ashniva/types';
import {
  Alert,
  Avatar,
  Badge,
  Card,
  DescriptionList,
  PageHeader,
  PriorityDot,
  Toolbar,
  VisibilityBadge,
  type DescriptionItem,
} from '@ashniva/ui';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { TaskStatusPill } from '../../../shared/components/StatusPills';
import { describeDue, formatDate, formatMinutes } from '../../../shared/lib/format';
import { usePermission, useSession } from '../../auth/session-context';
import { taskAnchor } from '../../communication/conversation-anchors';
import { ConversationPanel } from '../../communication/components/ConversationPanel';
import { FileList } from '../../files/components/FileList';
import { SendToTestingButton } from '../../qa/components/SendToTestingButton';
import { useTaskQuery } from '../api';
import { TaskActions } from '../components/TaskActions';
import { TaskComments } from '../components/TaskComments';
import { TaskHistory, TaskWorkLogs } from '../components/TaskHistory';
import { TaskSteps } from '../components/TaskSteps';
import { TaskEffort, TaskTimingBadge } from '../components/TaskTimingBadge';

import '../tasks.css';

/** Task detail: steps, description, comments, work, files, history, and the role's actions. */
export function TaskDetailPage() {
  const { id } = useParams();
  const query = useTaskQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <TaskDetailBody task={query.data} /> : null}
    </QueryState>
  );
}

function TaskDetailBody({ task }: { task: TaskDetail }) {
  const session = useSession();
  const canInternalComments = usePermission(PERMISSIONS.COMMENT_INTERNAL);
  // The permission is not the gate — the server checks project membership on every request. This
  // only decides whether to render a panel that would refuse them anyway.
  const canChat = usePermission(PERMISSIONS.CONVERSATION_PARTICIPATE);
  const canEditFiles = task.actions.some(
    (action) => (action.action === 'log-work' || action.action === 'edit') && action.enabled,
  );
  const userId = session.user?.id;
  const canUploadInternFiles = Boolean(
    task.isInternTask &&
      userId &&
      (task.assignedTo?.id === userId || task.createdBy.id === userId),
  );
  const canUploadFiles = canEditFiles || canUploadInternFiles;
  const crumbs = task.isInternTask
    ? [
        { key: 'intern', label: 'Intern work', href: '/intern-work' },
        { key: 'task', label: task.key },
      ]
    : [
        { key: 'tasks', label: 'Tasks', href: '/tasks' },
        { key: 'task', label: task.key },
      ];
  return (
    <div className="task-detail">
      <PageHeader
        breadcrumbs={crumbs}
        renderBreadcrumbLink={(href, children) => <Link to={href}>{children}</Link>}
        title={task.title}
        subtitle={
          <Toolbar aria-label="Task status">
            <TaskStatusPill status={task.status} />
            <PriorityDot priority={task.priority} showLabel />
            <VisibilityBadge visibility={task.clientVisible ? 'CLIENT' : 'INTERNAL'} />
            {task.isInternTask ? <Badge>Intern work</Badge> : null}
            {task.ticket ? (
              <Link to={`/tickets/${task.ticket.id}`}>From ticket T-{task.ticket.number}</Link>
            ) : null}
          </Toolbar>
        }
      />
      <TaskSteps status={task.status} />
      <div className="task-detail__grid">
        <div className="task-detail__column">
          <Card title="Description">
            <p className="prose">{task.description?.trim() || 'No description.'}</p>
            {task.acceptanceCriteria ? (
              <>
                <h3 className="task-detail__subheading">Acceptance criteria</h3>
                <p className="prose">{task.acceptanceCriteria}</p>
              </>
            ) : null}
            {/*
              An Alert rather than a styled paragraph: being blocked is the most important thing
              on the page, and `role="alert"` is what makes it reach somebody who is not looking
              at it. The old markup was a class declared in this feature's own stylesheet.
            */}
            {task.blockedReason ? (
              <Alert tone="danger" title="Blocked" className="task-detail__blocked">
                {task.blockedReason}
              </Alert>
            ) : null}
          </Card>
          <TaskComments task={task} canInternal={canInternalComments} />
          <Card
            title="Work log"
            headerAddon={<span className="muted">{formatMinutes(task.loggedMinutes)} total</span>}
          >
            <TaskWorkLogs workLogs={task.workLogs} />
          </Card>
          <Card title="Attachments">
            <FileList
              files={task.files}
              parent={{ taskId: task.id }}
              canUpload={canUploadFiles}
              chooseVisibility={!task.isInternTask}
              askCaption={task.isInternTask}
            />
          </Card>
          {canChat && !task.isInternTask ? (
            <ConversationPanel anchor={taskAnchor(task.id)} title="Internal chat" />
          ) : null}
          <Card title="History">
            <TaskHistory history={task.history} />
          </Card>
        </div>
        <div className="task-detail__column task-detail__column--aside">
          <Card title="Actions for your role">
            <TaskActions task={task} />
          </Card>
          {!isTaskClosed(task.status) ? (
            <Card
              title="Testing"
              headerAddon={
                task.tester ? (
                  <span className="muted">{task.tester.name}</span>
                ) : (
                  <span className="muted">No tester named</span>
                )
              }
            >
              <p className="muted">
                Hands this task to a tester with what they need to start. A project that gates on QA
                cannot publish a release until somebody has tested what is in it.
              </p>
              <div className="actions-card">
                <SendToTestingButton
                  subject={{
                    projectId: task.project.id,
                    taskId: task.id,
                    assignedToUserId: task.tester?.id ?? null,
                    assignedToName: task.tester?.name ?? null,
                    label: task.key,
                    whatToTest: task.acceptanceCriteria ?? task.title,
                  }}
                />
              </div>
            </Card>
          ) : null}
          <Card title="Details">
            <DescriptionList items={detailItems(task)} />
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * The detail panel's rows.
 *
 * A list rather than hand-written `<dt>`/`<dd>` pairs so the panel can restack itself on a narrow
 * column — which is what the aside becomes on a phone — without every caller of it agreeing.
 */
function detailItems(task: TaskDetail): DescriptionItem[] {
  const items: DescriptionItem[] = [
    {
      key: 'project',
      term: 'Project',
      description: (
        <>
          <Link to={`/projects/${task.project.id}`}>{task.project.name}</Link>
          {task.clientOrganization ? (
            <span className="muted"> · {task.clientOrganization.name}</span>
          ) : null}
        </>
      ),
    },
    { key: 'category', term: 'Category', description: task.category?.name ?? 'Development' },
    {
      key: 'assigned',
      term: 'Assigned',
      description: (
        <span className="task-detail__people">
          <Person name={task.createdBy.name} />
          <span aria-hidden="true">→</span>
          {task.assignedTo ? <Person name={task.assignedTo.name} /> : <span>unassigned</span>}
        </span>
      ),
    },
    {
      key: 'reviewer',
      term: 'Reviewer · Tester',
      description: `${task.reviewer?.name ?? '—'} · ${task.tester?.name ?? '—'}`,
    },
    {
      key: 'due',
      term: 'Due',
      description: (
        <span className={task.isOverdue ? 'due--overdue' : ''}>
          {formatDate(task.dueDate)} · {describeDue(task.dueDate, task.isOverdue)}{' '}
          {/*
            The full badge here, with its duration: the detail screen is where somebody has
            come to find out how late the task actually is, not to scan a column.
          */}
          <TaskTimingBadge timing={task.timing} />
        </span>
      ),
    },
    { key: 'priority', term: 'Priority', description: PRIORITY_LABELS[task.priority] },
    {
      key: 'time',
      term: 'Time',
      description: (
        <>
          {formatMinutes(task.loggedMinutes)}
          {task.estimateMinutes ? ` / est ${formatMinutes(task.estimateMinutes)}` : ''}{' '}
          <Badge tone="neutral">Internal</Badge>
          {/*
            Planned against actual, as a sentence and separate from the badge above. They are
            different questions: a task can be on time having taken three times the estimate,
            and one number for both would hide whichever mattered.
          */}
          <div className="task-detail__effort">
            <TaskEffort timing={task.timing} />
          </div>
        </>
      ),
    },
  ];
  if (task.module) {
    items.push({ key: 'module', term: 'Module', description: task.module });
  }
  items.push({
    key: 'client-update',
    term: 'Client update',
    description: describeClientUpdate(task),
  });
  return items;
}

function Person({ name }: { name: string }) {
  return (
    <span className="task-detail__person">
      <Avatar name={name} size="sm" />
      {name}
    </span>
  );
}

function describeClientUpdate(task: TaskDetail) {
  if (task.clientUpdate) {
    const label = {
      PUBLISHED: 'Published',
      PENDING: 'Waiting to publish',
      WITHDRAWN: 'Withdrawn',
    }[task.clientUpdate.status];
    return (
      <>
        {label} · <Link to="/completed-today">Completed Today</Link>
      </>
    );
  }
  return task.clientVisible ? 'Created when the task is approved' : 'Hidden from the client';
}
