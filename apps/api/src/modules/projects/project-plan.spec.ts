import { MILESTONE_PROGRESS_MODE, MILESTONE_STATUS, PROJECT_PLAN_ITEM_KIND } from '@ashniva/types';

import { toPortalProjectPlan } from '../portal/portal.mapper';
import { toProjectPlan, UNGROUPED_ITEM_ID } from './project-plan.mapper';
import type { PlanMilestoneRow, PlanTaskGroup } from './project-plan.repository';

const TODAY = new Date('2026-09-08T00:00:00Z');

const PROJECT = {
  id: 'project-1',
  code: 'ACM',
  name: 'Acme Retail POS',
  startDate: new Date('2026-07-01T00:00:00Z'),
  targetDate: new Date('2026-10-31T00:00:00Z'),
};

function milestone(over: Partial<PlanMilestoneRow> & { id: string }): PlanMilestoneRow {
  return {
    organizationId: 'org-1',
    projectId: PROJECT.id,
    contractId: null,
    changeRequestId: null,
    name: 'Milestone',
    description: null,
    ownerUserId: null,
    startDate: null,
    dueDate: null,
    status: MILESTONE_STATUS.IN_PROGRESS,
    progressPercent: 0,
    progressMode: MILESTONE_PROGRESS_MODE.AUTO,
    clientVisible: false,
    requiresApproval: false,
    sortOrder: 0,
    completedAt: null,
    createdById: 'user-1',
    createdAt: TODAY,
    updatedAt: TODAY,
    deletedAt: null,
    owner: null,
    deliverables: [],
    dependsOn: [],
    ...over,
  } as PlanMilestoneRow;
}

function group(over: Partial<PlanTaskGroup> & { milestoneId: string | null }): PlanTaskGroup {
  return {
    total: 0,
    completed: 0,
    overdue: 0,
    earliest: null,
    latest: null,
    ...over,
  };
}

function plan(input: {
  milestones?: PlanMilestoneRow[];
  groups?: PlanTaskGroup[];
  taskTotal?: number;
  taskCompleted?: number;
  cancelled?: number;
}) {
  const total = input.taskTotal ?? 0;
  const completed = input.taskCompleted ?? 0;
  return toProjectPlan({
    project: PROJECT,
    milestones: input.milestones ?? [],
    groups: input.groups ?? [],
    taskCounts: {
      total,
      open: total - completed - (input.cancelled ?? 0),
      inProgress: 0,
      inReview: 0,
      blocked: 0,
      completed,
      overdue: 0,
    },
    cancelledTasks: input.cancelled ?? 0,
    today: TODAY,
  });
}

describe('project plan — progress derivation', () => {
  it('reports 0% and no items for a project with nothing in it', () => {
    const result = plan({});
    expect(result.progress).toMatchObject({
      percent: 0,
      basis: 'NONE',
      taskTotal: 0,
      milestoneTotal: 0,
      deliverableTotal: 0,
    });
    expect(result.items).toEqual([]);
    // The project's own dates still frame the calendar, so an empty plan is still a plan.
    expect(result.window).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-10-31',
      todayDate: '2026-09-08',
    });
  });

  it('reports 100% when every task that counts is done', () => {
    const result = plan({ taskTotal: 9, taskCompleted: 8, cancelled: 1 });
    expect(result.progress.percent).toBe(100);
    expect(result.progress.basis).toBe('TASKS');
    // Cancelled work is out of the denominator, the same way the project list treats it.
    expect(result.progress.taskTotal).toBe(8);
  });

  it('uses the tasks under a milestone before its deliverables', () => {
    const result = plan({
      milestones: [
        milestone({
          id: 'm-tasks',
          deliverables: [{ isDone: true }, { isDone: true }] as PlanMilestoneRow['deliverables'],
        }),
      ],
      groups: [group({ milestoneId: 'm-tasks', total: 4, completed: 1 })],
      taskTotal: 4,
      taskCompleted: 1,
    });
    expect(result.items[0]?.progressPercent).toBe(25);
    expect(result.items[0]?.tasks).toEqual({ total: 4, completed: 1, open: 3, overdue: 0 });
  });

  it('falls back to deliverables when a milestone has no linked task', () => {
    const result = plan({
      milestones: [
        milestone({
          id: 'm-deliverables',
          deliverables: [{ isDone: true }, { isDone: false }] as PlanMilestoneRow['deliverables'],
        }),
      ],
    });
    expect(result.items[0]?.progressPercent).toBe(50);
    expect(result.progress.deliverableTotal).toBe(2);
    expect(result.progress.deliverableCompleted).toBe(1);
  });

  it('recomputes an AUTO milestone rather than trusting its stored percentage', () => {
    const result = plan({
      milestones: [
        milestone({
          id: 'm-stale',
          progressPercent: 30,
          deliverables: [{ isDone: true }, { isDone: true }] as PlanMilestoneRow['deliverables'],
        }),
      ],
    });
    expect(result.items[0]?.progressPercent).toBe(100);
  });

  it('reports a MANUAL override as the manager entered it', () => {
    const result = plan({
      milestones: [
        milestone({
          id: 'm-manual',
          progressMode: MILESTONE_PROGRESS_MODE.MANUAL,
          progressPercent: 70,
          deliverables: [{ isDone: false }] as PlanMilestoneRow['deliverables'],
        }),
      ],
    });
    expect(result.items[0]?.progressPercent).toBe(70);
    expect(result.items[0]?.progressMode).toBe('MANUAL');
  });

  it('counts a completed milestone as done whatever its deliverables say', () => {
    const result = plan({
      milestones: [
        milestone({
          id: 'm-done',
          status: MILESTONE_STATUS.COMPLETED,
          deliverables: [{ isDone: false }] as PlanMilestoneRow['deliverables'],
        }),
      ],
    });
    expect(result.items[0]?.progressPercent).toBe(100);
    expect(result.progress.milestoneCompleted).toBe(1);
  });
});

describe('project plan — dates and grouping', () => {
  it('places a milestone on its own dates and widens the window to fit', () => {
    const result = plan({
      milestones: [
        milestone({
          id: 'm-dated',
          startDate: new Date('2026-06-01T00:00:00Z'),
          dueDate: new Date('2026-12-01T00:00:00Z'),
        }),
      ],
    });
    expect(result.items[0]).toMatchObject({
      startDate: '2026-06-01',
      endDate: '2026-12-01',
      datesFromTasks: false,
    });
    expect(result.window).toMatchObject({ startDate: '2026-06-01', endDate: '2026-12-01' });
  });

  it('falls back to the span of its work when a milestone has no dates', () => {
    const result = plan({
      milestones: [milestone({ id: 'm-undated' })],
      groups: [
        group({
          milestoneId: 'm-undated',
          total: 2,
          completed: 1,
          earliest: new Date('2026-08-03T00:00:00Z'),
          latest: new Date('2026-09-30T00:00:00Z'),
        }),
      ],
      taskTotal: 2,
      taskCompleted: 1,
    });
    expect(result.items[0]).toMatchObject({
      startDate: '2026-08-03',
      endDate: '2026-09-30',
      datesFromTasks: true,
    });
  });

  it('flags an open milestone past its due date, and leaves a finished one alone', () => {
    const result = plan({
      milestones: [
        milestone({ id: 'm-late', dueDate: new Date('2026-09-01T00:00:00Z') }),
        milestone({
          id: 'm-shipped',
          status: MILESTONE_STATUS.COMPLETED,
          dueDate: new Date('2026-09-01T00:00:00Z'),
        }),
      ],
    });
    expect(result.items.map((item) => item.isOverdue)).toEqual([true, false]);
  });

  it('gathers the work no milestone claims into one bucket, last', () => {
    const result = plan({
      milestones: [milestone({ id: 'm-1' })],
      groups: [
        group({ milestoneId: 'm-1', total: 1, completed: 1 }),
        group({
          milestoneId: null,
          total: 4,
          completed: 1,
          earliest: new Date('2026-09-01T00:00:00Z'),
          latest: new Date('2026-09-20T00:00:00Z'),
        }),
      ],
      taskTotal: 5,
      taskCompleted: 2,
    });
    const ungrouped = result.items.at(-1);
    expect(ungrouped).toMatchObject({
      id: UNGROUPED_ITEM_ID,
      kind: PROJECT_PLAN_ITEM_KIND.UNGROUPED,
      status: null,
      progressPercent: 25,
      clientVisible: false,
    });
    // The bucket is work, not a milestone: it must not move the milestone counters.
    expect(result.progress.milestoneTotal).toBe(1);
  });

  it('omits the bucket when every task belongs to a milestone', () => {
    const result = plan({
      milestones: [milestone({ id: 'm-1' })],
      groups: [group({ milestoneId: 'm-1', total: 2, completed: 2 })],
      taskTotal: 2,
      taskCompleted: 2,
    });
    expect(result.items).toHaveLength(1);
  });
});

describe('project plan — what a client is given', () => {
  const INTERNAL = {
    milestoneName: 'Internal hardening sprint',
    ownerEmail: 'lead@example.com',
  };

  const internalPlan = plan({
    milestones: [
      milestone({
        id: 'm-client',
        name: 'Pilot store live',
        clientVisible: true,
        startDate: new Date('2026-08-14T00:00:00Z'),
        dueDate: new Date('2026-09-20T00:00:00Z'),
        owner: { id: 'user-lead', name: 'Sneha R', email: INTERNAL.ownerEmail },
        dependsOn: [{ dependsOnId: 'm-internal' }],
        deliverables: [{ isDone: true }, { isDone: false }] as PlanMilestoneRow['deliverables'],
      }),
      milestone({
        id: 'm-internal',
        name: INTERNAL.milestoneName,
        clientVisible: false,
        startDate: new Date('2026-05-01T00:00:00Z'),
        dueDate: new Date('2027-01-31T00:00:00Z'),
      }),
    ],
    groups: [
      group({ milestoneId: 'm-client', total: 6, completed: 3, overdue: 2 }),
      group({ milestoneId: 'm-internal', total: 4, completed: 0 }),
      group({
        milestoneId: null,
        total: 3,
        completed: 0,
        earliest: new Date('2026-04-01T00:00:00Z'),
        latest: new Date('2027-06-30T00:00:00Z'),
      }),
    ],
    taskTotal: 13,
    taskCompleted: 3,
  });

  const portal = toPortalProjectPlan(internalPlan);
  const wire = JSON.stringify(portal);

  it('shows only the milestones the team marked client-visible', () => {
    expect(portal.items.map((item) => item.name)).toEqual(['Pilot store live']);
    expect(portal.progress.milestoneTotal).toBe(1);
  });

  it('carries no internal milestone, owner, dependency or overdue field', () => {
    expect(wire).not.toContain(INTERNAL.milestoneName);
    expect(wire).not.toContain(INTERNAL.ownerEmail);
    expect(wire).not.toContain('owner');
    expect(wire).not.toContain('dependsOn');
    expect(wire).not.toContain('overdue');
    expect(wire).not.toContain('clientVisible');
    expect(wire).not.toContain('progressMode');
    expect(wire).not.toContain(UNGROUPED_ITEM_ID);
  });

  it('draws the calendar from the visible milestones only', () => {
    // The internal milestone runs 2026-05-01 → 2027-01-31 and the unscheduled work runs wider
    // still; neither may show through as a date on the client's window.
    expect(portal.window).toEqual({
      startDate: '2026-08-14',
      endDate: '2026-09-20',
      todayDate: '2026-09-08',
    });
  });

  it('keeps the project percentage the client already sees elsewhere', () => {
    expect(portal.progress.percent).toBe(internalPlan.progress.percent);
  });

  it('has no visible milestone, and no window, when nothing was shared', () => {
    const nothingShared = toPortalProjectPlan(
      plan({ milestones: [milestone({ id: 'm-internal-only' })] }),
    );
    expect(nothingShared.items).toEqual([]);
    expect(nothingShared.window.startDate).toBeNull();
    expect(nothingShared.window.endDate).toBeNull();
  });
});
