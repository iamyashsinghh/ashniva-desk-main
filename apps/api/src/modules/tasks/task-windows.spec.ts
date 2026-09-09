import { OPEN_TASK_STATUSES, TASK_STATUS } from '@ashniva/types';

import {
  overdueWhere,
  scheduledBetweenWhere,
  startedBetweenWhere,
  upcomingWhere,
} from './task-windows';

const DAY = new Date('2026-09-16T00:00:00.000Z');
const NEXT_DAY = new Date('2026-09-17T00:00:00.000Z');

/** The statuses these predicates keep, so the assertions below read as statements not lookups. */
const openStatuses = { in: [...OPEN_TASK_STATUSES] };

describe('task time windows', () => {
  it('treats only open work as overdue', () => {
    expect(overdueWhere(DAY)).toEqual({ dueDate: { lt: DAY }, status: openStatuses });
    expect(OPEN_TASK_STATUSES).not.toContain(TASK_STATUS.COMPLETED);
  });

  it('counts a task as scheduled for today only while it is still open', () => {
    expect(scheduledBetweenWhere(DAY, NEXT_DAY)).toEqual({
      scheduledStartAt: { gte: DAY, lt: NEXT_DAY },
      status: openStatuses,
    });
  });

  // A task begun this morning and finished this afternoon still started today: narrowing this by
  // status would make the number fall every time somebody completed something.
  it('counts work started today whatever became of it since', () => {
    expect(startedBetweenWhere(DAY, NEXT_DAY)).toEqual({
      startedAt: { gte: DAY, lt: NEXT_DAY },
    });
    expect(startedBetweenWhere(DAY, NEXT_DAY)).not.toHaveProperty('status');
  });

  it('treats work whose start is still ahead as upcoming, not as work in hand', () => {
    expect(upcomingWhere(DAY)).toEqual({
      scheduledStartAt: { gt: DAY },
      status: openStatuses,
    });
  });
});
