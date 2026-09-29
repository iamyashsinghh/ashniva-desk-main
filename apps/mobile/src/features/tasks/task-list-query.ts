import {
  ALL_TASK_STATUSES,
  PRIORITY_LABELS,
  TASK_LIST_VIEW,
  type Priority,
  type TaskListView,
  type TaskStatus,
} from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';

/**
 * The task list's query, as data.
 *
 * The list screens never filter on the device: every view, status and flag is a parameter of
 * `GET /tasks`, so the count a dashboard tile showed and the rows behind it come from the same
 * query. This file turns screen state into those parameters and back, so a tile's link, the
 * filter sheet and the chips above the list (`task-list-chips.ts`) all speak one shape.
 */

export const TASK_VIEW_LABELS: Record<TaskListView, string> = {
  my: 'My tasks',
  upcoming: 'Upcoming',
  'by-me': 'Assigned by me',
  team: 'Team',
  today: 'Today',
  overdue: 'Overdue',
  review: 'Reviews',
  done: 'Completed',
  all: 'All',
  intern: 'Intern work',
};

export const TASK_VIEW_ICONS: Record<TaskListView, IconName> = {
  my: 'person-outline',
  upcoming: 'calendar-outline',
  'by-me': 'send-outline',
  team: 'people-outline',
  today: 'today-outline',
  overdue: 'alarm-outline',
  review: 'eye-outline',
  done: 'checkmark-done-outline',
  all: 'albums-outline',
  intern: 'school-outline',
};

/**
 * The views offered, in the web app's order and by the web app's rule: intern work has a screen
 * of its own, and the two views about other people's work need `task:assign`. The API scopes
 * every view to what the caller may read regardless; this only avoids offering an empty tab.
 */
export function visibleTaskViews(canAssign: boolean): TaskListView[] {
  return Object.values(TASK_LIST_VIEW).filter((view) => {
    if (view === TASK_LIST_VIEW.INTERN) {
      return false;
    }
    return view === TASK_LIST_VIEW.BY_ME || view === TASK_LIST_VIEW.TEAM ? canAssign : true;
  });
}

/** The narrowing switches `GET /tasks` takes on top of a view — what dashboard tiles link with. */
export const TASK_QUERY_FLAGS = [
  'overdue',
  'completedToday',
  'scheduledToday',
  'startedToday',
  'upcoming',
] as const;

export type TaskQueryFlag = (typeof TASK_QUERY_FLAGS)[number];

export const TASK_FLAG_LABELS: Record<TaskQueryFlag, string> = {
  overdue: 'Overdue only',
  completedToday: 'Completed today',
  scheduledToday: 'Scheduled today',
  startedToday: 'Started today',
  upcoming: 'Upcoming',
};

export interface TaskFilters {
  statuses: TaskStatus[];
  priority: Priority | null;
  projectId: string | null;
  assignedToId: string | null;
  flags: TaskQueryFlag[];
}

export const NO_TASK_FILTERS: TaskFilters = {
  statuses: [],
  priority: null,
  projectId: null,
  assignedToId: null,
  flags: [],
};

/** How many filters are in force, for the badge on the Filters button. */
export function countTaskFilters(filters: TaskFilters): number {
  return (
    (filters.statuses.length > 0 ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (filters.projectId ? 1 : 0) +
    (filters.assignedToId ? 1 : 0) +
    filters.flags.length
  );
}

/** The `/tasks` query parameters for a view, its filters and a search term. */
export function taskListQuery(
  view: TaskListView,
  filters: TaskFilters,
  search: string,
): Record<string, string> {
  const query: Record<string, string> = { view };
  if (filters.statuses.length > 0) {
    query.status = filters.statuses.join(',');
  }
  if (filters.priority) {
    query.priority = filters.priority;
  }
  if (filters.projectId) {
    query.projectId = filters.projectId;
  }
  if (filters.assignedToId) {
    query.assignedToId = filters.assignedToId;
  }
  for (const flag of filters.flags) {
    query[flag] = 'true';
  }
  const term = search.trim();
  if (term) {
    query.search = term;
  }
  return query;
}

function isView(value: string | undefined): value is TaskListView {
  return (Object.values(TASK_LIST_VIEW) as string[]).includes(value ?? '');
}

function isPriority(value: string | undefined): value is Priority {
  return value !== undefined && value in PRIORITY_LABELS;
}

/**
 * A dashboard tile's query read back into screen state.
 *
 * Anything the endpoint would refuse is dropped rather than passed on: a stale link must narrow
 * the list less, not replace it with a 400. `status=overdue` is the web app's legacy spelling of
 * the overdue flag and is read the same way here.
 */
export function taskStateFromQuery(query: Readonly<Record<string, string>>): {
  view: TaskListView;
  filters: TaskFilters;
  search: string;
} {
  const rawStatus = query.status ?? '';
  const legacyOverdue = rawStatus === 'overdue';
  const statuses = legacyOverdue
    ? []
    : rawStatus
        .split(',')
        .filter((entry): entry is TaskStatus =>
          (ALL_TASK_STATUSES as readonly string[]).includes(entry),
        );
  const flags = TASK_QUERY_FLAGS.filter(
    (flag) => query[flag] === 'true' || (flag === 'overdue' && legacyOverdue),
  );
  return {
    view: isView(query.view) ? query.view : TASK_LIST_VIEW.MY,
    filters: {
      statuses,
      priority: isPriority(query.priority) ? query.priority : null,
      projectId: query.projectId || null,
      assignedToId: query.assignedToId || null,
      flags,
    },
    search: query.search ?? '',
  };
}
