import {
  PERMISSIONS,
  PRIORITY_LABELS,
  TASK_LIST_VIEW,
  TASK_STATUS_LABELS,
  type PaginatedResponse,
  type Priority,
  type TaskListView,
  type TaskStatus,
  type TaskSummary,
} from '@ashniva/types';
import {
  Button,
  FilterChip,
  Input,
  PageHeader,
  SegmentedControl,
  Select,
  Toolbar,
} from '@ashniva/ui';
import { useNavigate, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { usePermission } from '../../auth/session-context';
import { useProjectsQuery } from '../../projects/api';
import { useTasksQuery } from '../api';
import { TaskBoard } from '../components/TaskBoard';
import { TaskTable } from '../components/TaskTable';

import '../tasks.css';

const VIEW_LABELS: Record<TaskListView, string> = {
  my: 'My tasks',
  upcoming: 'Upcoming',
  'by-me': 'Assigned by me',
  team: 'Team',
  today: 'Today',
  overdue: 'Overdue',
  review: 'Reviews',
  done: 'Completed',
  all: 'All',
};

type Layout = 'board' | 'list';
const VIEWS = Object.values(TASK_LIST_VIEW);
const PRIORITIES = Object.keys(PRIORITY_LABELS) as Priority[];

/** Task list: view chips, project / priority / search filters, board or list layout. */
export function TasksPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canCreate = usePermission(PERMISSIONS.TASK_CREATE);
  const canAssign = usePermission(PERMISSIONS.TASK_ASSIGN);

  const rawStatus = params.get('status') ?? '';
  const view = (params.get('view') ?? 'my') as TaskListView;
  // "status=overdue" was never a status; older dashboard links and bookmarks still carry it, so
  // it is read as the overdue filter instead of being passed to the API as a bad status value.
  const legacyOverdue = rawStatus === 'overdue';
  const overdue = legacyOverdue || params.get('overdue') === 'true';
  const status = rawStatus && !legacyOverdue ? (rawStatus.split(',') as TaskStatus[]) : undefined;
  const completedToday = params.get('completedToday') === 'true';
  const scheduledToday = params.get('scheduledToday') === 'true';
  const startedToday = params.get('startedToday') === 'true';
  const upcoming = params.get('upcoming') === 'true';
  const layout: Layout = params.get('layout') === 'list' ? 'list' : 'board';
  const projectId = params.get('projectId') ?? '';
  const priority = (params.get('priority') ?? '') as Priority | '';
  const search = params.get('search') ?? '';

  const tasks = useTasksQuery({
    view,
    status,
    overdue: overdue || undefined,
    completedToday: completedToday || undefined,
    scheduledToday: scheduledToday || undefined,
    startedToday: startedToday || undefined,
    upcoming: upcoming || undefined,
    projectId: projectId || undefined,
    priority: priority || undefined,
    search: search || undefined,
  });
  const projects = useProjectsQuery();

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key === 'view') {
      next.delete('status');
    }
    if (key === 'overdue') {
      // Drop the legacy spelling so the two cannot contradict each other.
      next.delete('status');
    }
    setParams(next, { replace: true });
  };

  // Everything narrowing the list beyond the chosen view, so a filter carried in from a link is
  // visible and can be switched off instead of quietly emptying the page.
  const narrowing = [
    overdue ? { key: 'overdue', label: 'Overdue only' } : null,
    completedToday ? { key: 'completedToday', label: 'Completed today' } : null,
    scheduledToday ? { key: 'scheduledToday', label: 'Scheduled today' } : null,
    startedToday ? { key: 'startedToday', label: 'Started today' } : null,
    upcoming ? { key: 'upcoming', label: 'Upcoming' } : null,
    status
      ? { key: 'status', label: `Status: ${status.map((s) => TASK_STATUS_LABELS[s]).join(', ')}` }
      : null,
    projectId
      ? {
          key: 'projectId',
          label: `Project: ${projects.data?.find((p) => p.id === projectId)?.name ?? projectId}`,
        }
      : null,
    priority ? { key: 'priority', label: `Priority: ${PRIORITY_LABELS[priority]}` } : null,
    search ? { key: 'search', label: `Search: ${search}` } : null,
  ].filter((entry) => entry !== null);

  const visibleViews = VIEWS.filter((entry) =>
    entry === 'by-me' || entry === 'team' ? canAssign : true,
  );

  return (
    <div className="tasks-page">
      <PageHeader
        title="Tasks"
        subtitle={tasks.isError ? undefined : describeTotal(tasks.data)}
        actions={
          canCreate ? (
            <Button variant="primary" onClick={() => void navigate('/tasks/new')}>
              + Create task
            </Button>
          ) : undefined
        }
      >
        <SegmentedControl
          aria-label="View"
          size="sm"
          value={view}
          onChange={(next) => setParam('view', next)}
          options={visibleViews.map((entry) => ({ key: entry, label: VIEW_LABELS[entry] }))}
        />
        <Toolbar aria-label="Task filters">
          <Select
            aria-label="Project"
            value={projectId}
            onChange={(event) => setParam('projectId', event.target.value)}
            options={[
              { value: '', label: 'All projects' },
              ...(projects.data ?? []).map((project) => ({
                value: project.id,
                label: project.name,
              })),
            ]}
          />
          <Select
            aria-label="Priority"
            value={priority}
            onChange={(event) => setParam('priority', event.target.value)}
            options={[
              { value: '', label: 'Any priority' },
              ...PRIORITIES.map((entry) => ({ value: entry, label: PRIORITY_LABELS[entry] })),
            ]}
          />
          <Input
            type="search"
            aria-label="Search tasks"
            placeholder="Search tasks…"
            defaultValue={search}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setParam('search', (event.target as HTMLInputElement).value);
              }
            }}
          />
          <SegmentedControl
            aria-label="Layout"
            size="sm"
            value={layout}
            onChange={(next) => setParam('layout', next)}
            options={[
              { key: 'board', label: 'Board' },
              { key: 'list', label: 'List' },
            ]}
          />
          <Button
            size="sm"
            variant={overdue ? 'primary' : 'secondary'}
            aria-pressed={overdue}
            onClick={() => setParam('overdue', overdue ? '' : 'true')}
          >
            Overdue only
          </Button>
        </Toolbar>
      </PageHeader>

      {narrowing.length > 0 ? (
        <Toolbar aria-label="Active filters" className="tasks-page__filters">
          {narrowing.map((entry) => (
            <FilterChip
              key={entry.key}
              label={entry.label}
              removeLabel={`Clear filter ${entry.label}`}
              onRemove={() => setParam(entry.key, '')}
            />
          ))}
        </Toolbar>
      ) : null}

      <QueryState
        isLoading={tasks.isLoading}
        isError={tasks.isError}
        error={tasks.error}
        onRetry={() => void tasks.refetch()}
        /*
         * The list keeps its shape while it reloads. Every view chip and every filter above
         * refetches, and a spinner that replaces the table moves the whole page each time.
         */
        loadingFallback={<TaskResults layout={layout} tasks={[]} loading />}
      >
        {tasks.data ? <TaskResults layout={layout} tasks={tasks.data.items} /> : null}
      </QueryState>
    </div>
  );
}

/**
 * `total` is counted over the whole filtered set, before paging, so it is the number a dashboard
 * card must agree with. One page of rows is rendered, so say so when there are more.
 */
function describeTotal(page: PaginatedResponse<TaskSummary> | undefined): string | undefined {
  if (!page || page.total === undefined) {
    return undefined;
  }
  if (page.items.length < page.total) {
    return `${page.total} tasks · showing the first ${page.items.length}`;
  }
  return `${page.total} tasks`;
}

function TaskResults({
  layout,
  tasks,
  loading = false,
}: {
  layout: Layout;
  tasks: TaskSummary[];
  loading?: boolean;
}) {
  if (layout === 'board') {
    return <TaskBoard tasks={tasks} loading={loading} />;
  }
  return (
    <TaskTable
      tasks={tasks}
      loading={loading}
      emptyTitle="No tasks match"
      emptyDescription="Try another view or clear the filters."
    />
  );
}
