import { TASK_STATUS } from './task-status';
import { TICKET_STATUS } from './ticket-status';
import {
  WORKLOAD_TASK_STATUSES,
  WORKLOAD_TICKET_STATUSES,
  activeWorkload,
  hasCapacity,
} from './support-workload';

/** The one definition of "busy". If this drifts, the routing limit stops meaning anything. */

describe('what counts as workload', () => {
  it('counts every open ticket', () => {
    expect(WORKLOAD_TICKET_STATUSES).toContain(TICKET_STATUS.AUTO_ASSIGNED);
    expect(WORKLOAD_TICKET_STATUSES).toContain(TICKET_STATUS.IN_PROGRESS);
    expect(WORKLOAD_TICKET_STATUSES).toContain(TICKET_STATUS.ESCALATED);
  });

  it('counts no closed ticket', () => {
    for (const status of [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELLED]) {
      expect({ status, counted: WORKLOAD_TICKET_STATUSES.includes(status) }).toEqual({
        status,
        counted: false,
      });
    }
  });

  it('counts started tasks but not planned or blocked ones', () => {
    expect(WORKLOAD_TASK_STATUSES).toContain(TASK_STATUS.IN_PROGRESS);
    expect(WORKLOAD_TASK_STATUSES).toContain(TASK_STATUS.QA_FAILED);
    for (const status of [TASK_STATUS.DRAFT, TASK_STATUS.ASSIGNED, TASK_STATUS.BLOCKED]) {
      // A groomed backlog is not load; neither is work somebody cannot do.
      expect({ status, counted: WORKLOAD_TASK_STATUSES.includes(status) }).toEqual({
        status,
        counted: false,
      });
    }
  });

  it('counts no finished task', () => {
    for (const status of [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED]) {
      expect({ status, counted: WORKLOAD_TASK_STATUSES.includes(status) }).toEqual({
        status,
        counted: false,
      });
    }
  });
});

describe('the limit', () => {
  it('adds tickets and tasks into one number', () => {
    expect(activeWorkload({ openTickets: 3, activeTasks: 2 })).toBe(5);
  });

  it('has room below the limit and none at it', () => {
    expect(hasCapacity({ openTickets: 4, activeTasks: 0 }, 5)).toBe(true);
    expect(hasCapacity({ openTickets: 5, activeTasks: 0 }, 5)).toBe(false);
    expect(hasCapacity({ openTickets: 3, activeTasks: 2 }, 5)).toBe(false);
  });

  it('treats no limit as no ceiling rather than no capacity', () => {
    // The opposite reading would make an unconfigured project route nothing at all.
    expect(hasCapacity({ openTickets: 99, activeTasks: 99 }, null)).toBe(true);
    expect(hasCapacity({ openTickets: 99, activeTasks: 99 }, undefined)).toBe(true);
    expect(hasCapacity({ openTickets: 99, activeTasks: 99 }, 0)).toBe(true);
  });
});
