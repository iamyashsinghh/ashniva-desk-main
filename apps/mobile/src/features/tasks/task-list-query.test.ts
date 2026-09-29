import { PRIORITY, TASK_LIST_VIEW, TASK_STATUS } from '@ashniva/types';

import { taskEmptyCopy, taskFilterChips, withoutTaskChip } from './task-list-chips';
import {
  NO_TASK_FILTERS,
  countTaskFilters,
  taskListQuery,
  taskStateFromQuery,
  visibleTaskViews,
  type TaskFilters,
} from './task-list-query';

const narrowed: TaskFilters = {
  statuses: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED],
  priority: PRIORITY.HIGH,
  projectId: 'p1',
  assignedToId: 'u1',
  flags: ['overdue'],
};

describe('visibleTaskViews', () => {
  it('offers the views about other people only to somebody who assigns work', () => {
    expect(visibleTaskViews(false)).not.toContain(TASK_LIST_VIEW.TEAM);
    expect(visibleTaskViews(false)).not.toContain(TASK_LIST_VIEW.BY_ME);
    expect(visibleTaskViews(true)).toEqual(
      expect.arrayContaining([TASK_LIST_VIEW.TEAM, TASK_LIST_VIEW.BY_ME]),
    );
  });

  it('never offers intern work, which has a screen of its own', () => {
    expect(visibleTaskViews(true)).not.toContain(TASK_LIST_VIEW.INTERN);
  });
});

describe('taskListQuery', () => {
  it('sends only the view when nothing narrows it', () => {
    expect(taskListQuery(TASK_LIST_VIEW.MY, NO_TASK_FILTERS, '  ')).toEqual({ view: 'my' });
  });

  it('spells every filter the way GET /tasks reads it', () => {
    expect(taskListQuery(TASK_LIST_VIEW.TEAM, narrowed, ' login ')).toEqual({
      view: 'team',
      status: 'IN_PROGRESS,BLOCKED',
      priority: 'HIGH',
      projectId: 'p1',
      assignedToId: 'u1',
      overdue: 'true',
      search: 'login',
    });
  });
});

describe('taskStateFromQuery', () => {
  it('round-trips what taskListQuery produced', () => {
    const query = taskListQuery(TASK_LIST_VIEW.TEAM, narrowed, 'login');
    expect(taskStateFromQuery(query)).toEqual({
      view: TASK_LIST_VIEW.TEAM,
      filters: narrowed,
      search: 'login',
    });
  });

  it('drops what the endpoint would refuse, rather than failing the list', () => {
    const state = taskStateFromQuery({ view: 'nope', status: 'NOT_A_STATUS', priority: 'VERY' });
    expect(state.view).toBe(TASK_LIST_VIEW.MY);
    expect(state.filters).toEqual(NO_TASK_FILTERS);
  });

  it('reads the legacy status=overdue as the overdue flag', () => {
    const state = taskStateFromQuery({ view: 'team', status: 'overdue' });
    expect(state.filters.statuses).toEqual([]);
    expect(state.filters.flags).toEqual(['overdue']);
  });
});

describe('the chips', () => {
  it('counts one per kind of filter, and each flag on its own', () => {
    expect(countTaskFilters(NO_TASK_FILTERS)).toBe(0);
    expect(countTaskFilters(narrowed)).toBe(5);
  });

  it('names the project and person when they are known', () => {
    const labels = taskFilterChips(narrowed, 'login', { project: 'Acme', person: 'Ravi' }).map(
      (chip) => chip.label,
    );
    expect(labels).toEqual([
      'Overdue only',
      'Status: In progress, Blocked',
      'Priority: High',
      'Project: Acme',
      'Assignee: Ravi',
      'Search: login',
    ]);
  });

  it('removes exactly the chip that was tapped', () => {
    expect(withoutTaskChip(narrowed, 'overdue').flags).toEqual([]);
    expect(withoutTaskChip(narrowed, 'status')).toEqual({ ...narrowed, statuses: [] });
    expect(withoutTaskChip(narrowed, 'projectId').projectId).toBeNull();
  });
});

describe('taskEmptyCopy', () => {
  it('says "no match" when the list was narrowed, not "nothing assigned"', () => {
    expect(taskEmptyCopy(TASK_LIST_VIEW.MY, true).title).toBe('No tasks match');
    expect(taskEmptyCopy(TASK_LIST_VIEW.MY, false).title).toBe('Nothing assigned');
  });
});
