import {
  PRIORITY_LABELS,
  TASK_LIST_VIEW,
  TASK_STATUS_LABELS,
  type TaskListView,
} from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import {
  TASK_FLAG_LABELS,
  TASK_VIEW_ICONS,
  TASK_VIEW_LABELS,
  type TaskFilters,
  type TaskQueryFlag,
} from './task-list-query';

export type TaskChipKey =
  'status' | 'priority' | 'projectId' | 'assignedToId' | 'search' | TaskQueryFlag;

export interface TaskFilterChip {
  key: TaskChipKey;
  label: string;
}

/**
 * Everything narrowing the list, as removable chips — so a filter carried in from a tile is
 * visible and can be switched off instead of quietly emptying the screen.
 */
export function taskFilterChips(
  filters: TaskFilters,
  search: string,
  names: { project?: string | undefined; person?: string | undefined } = {},
): TaskFilterChip[] {
  const chips: TaskFilterChip[] = filters.flags.map((flag) => ({
    key: flag,
    label: TASK_FLAG_LABELS[flag],
  }));
  if (filters.statuses.length > 0) {
    const labels = filters.statuses.map((status) => TASK_STATUS_LABELS[status]);
    chips.push({ key: 'status', label: `Status: ${labels.join(', ')}` });
  }
  if (filters.priority) {
    chips.push({ key: 'priority', label: `Priority: ${PRIORITY_LABELS[filters.priority]}` });
  }
  if (filters.projectId) {
    chips.push({ key: 'projectId', label: `Project: ${names.project ?? 'selected'}` });
  }
  if (filters.assignedToId) {
    chips.push({ key: 'assignedToId', label: `Assignee: ${names.person ?? 'selected'}` });
  }
  if (search.trim()) {
    chips.push({ key: 'search', label: `Search: ${search.trim()}` });
  }
  return chips;
}

/** The filters with one chip's worth removed. Search is the caller's own state. */
export function withoutTaskChip(filters: TaskFilters, key: TaskChipKey): TaskFilters {
  switch (key) {
    case 'status':
      return { ...filters, statuses: [] };
    case 'priority':
      return { ...filters, priority: null };
    case 'projectId':
      return { ...filters, projectId: null };
    case 'assignedToId':
      return { ...filters, assignedToId: null };
    case 'search':
      return filters;
    default:
      return { ...filters, flags: filters.flags.filter((flag) => flag !== key) };
  }
}

/**
 * What an empty list says. A filtered list that comes back empty says so, because "nothing
 * assigned" is untrue when the truth is "nothing matches what you narrowed it to".
 */
export function taskEmptyCopy(
  view: TaskListView,
  narrowed: boolean,
): { title: string; description: string; icon: IconName } {
  if (narrowed) {
    return {
      title: 'No tasks match',
      description: 'Try another view or clear the filters.',
      icon: 'funnel-outline',
    };
  }
  if (view === TASK_LIST_VIEW.MY) {
    return {
      title: 'Nothing assigned',
      description: 'Tasks you can work on now will appear here.',
      icon: 'checkmark-done-circle-outline',
    };
  }
  if (view === TASK_LIST_VIEW.UPCOMING) {
    return {
      title: 'Nothing scheduled',
      description: 'Tasks assigned to you with a start date in the future will appear here.',
      icon: 'calendar-clear-outline',
    };
  }
  return {
    title: 'No tasks here',
    description: `Nothing in ${TASK_VIEW_LABELS[view]} right now.`,
    icon: TASK_VIEW_ICONS[view],
  };
}
