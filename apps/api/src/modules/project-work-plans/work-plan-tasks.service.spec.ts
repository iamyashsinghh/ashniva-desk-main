import {
  AUDIT_ACTION,
  ROLE_KEYS,
  TASK_STATUS,
  WORK_PLAN_POINT_STATUS,
  type AuthenticatedUser,
} from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import type { TaskEventsService } from '../tasks/task-events.service';
import type { TasksRepository, TaskSummaryRow } from '../tasks/tasks.repository';
import type { ProjectRow } from '../projects/projects.repository';
import type { WorkPlanRow } from './work-plan.mapper';
import { WorkPlanTasksService, taskStatusFromPoints } from './work-plan-tasks.service';

const ORG = 'org-1';
const DEV = 'dev-1';
const S = WORK_PLAN_POINT_STATUS;

const lead: AuthenticatedUser = {
  userId: 'lead-1',
  organizationId: ORG,
  roleKey: ROLE_KEYS.TEAM_LEAD,
  permissions: [],
  isServiceProvider: true,
};

const step = (status: string, isError = false) => ({ status, isError });

describe('taskStatusFromPoints', () => {
  it('waits while nothing has been started', () => {
    expect(taskStatusFromPoints([step(S.PENDING), step(S.PENDING)])).toBeNull();
    expect(taskStatusFromPoints([])).toBeNull();
  });

  it('follows the developer and the tester through one step', () => {
    expect(taskStatusFromPoints([step(S.IN_PROGRESS)])).toBe(TASK_STATUS.IN_PROGRESS);
    expect(taskStatusFromPoints([step(S.AWAITING_TEST)])).toBe(TASK_STATUS.IN_REVIEW);
    expect(taskStatusFromPoints([step(S.TESTING)])).toBe(TASK_STATUS.IN_REVIEW);
    expect(taskStatusFromPoints([step(S.RETURNED), step(S.PENDING, true)])).toBe(
      TASK_STATUS.RETURNED_TO_DEV,
    );
    expect(taskStatusFromPoints([step(S.COMPLETED), step(S.COMPLETED, true)])).toBe(
      TASK_STATUS.COMPLETED,
    );
  });

  it('is not completed until the tester has passed every step', () => {
    expect(taskStatusFromPoints([step(S.COMPLETED), step(S.TESTING)])).toBe(TASK_STATUS.IN_REVIEW);
    expect(taskStatusFromPoints([step(S.COMPLETED), step(S.PENDING)])).toBe(
      TASK_STATUS.IN_PROGRESS,
    );
  });

  it('shows a step sent back ahead of the others', () => {
    expect(taskStatusFromPoints([step(S.RETURNED), step(S.IN_PROGRESS)])).toBe(
      TASK_STATUS.RETURNED_TO_DEV,
    );
  });

  it('goes back to testing once the fix is sent, even with the error step still open', () => {
    expect(taskStatusFromPoints([step(S.AWAITING_TEST), step(S.IN_PROGRESS, true)])).toBe(
      TASK_STATUS.IN_REVIEW,
    );
  });
});

function taskRow(overrides: Partial<TaskSummaryRow> = {}): TaskSummaryRow {
  return {
    id: 'task-1',
    status: TASK_STATUS.ASSIGNED,
    assignedToId: DEV,
    startedAt: null,
    deletedAt: null,
    module: 'Work plan',
    project: { code: 'ACM' },
    number: 7,
    ...overrides,
  } as unknown as TaskSummaryRow;
}

function setup(existing: TaskSummaryRow | null, points: Array<{ status: string; isError: boolean }>) {
  const tasks = {
    findByWorkPlanTitle: jest.fn(async () => existing),
    create: jest.fn(async (_org: string, data: Record<string, unknown>) =>
      taskRow({ ...(data as Partial<TaskSummaryRow>) }),
    ),
    update: jest.fn(async (_org: string, _id: string, data: Record<string, unknown>) =>
      taskRow({ ...existing, ...(data as Partial<TaskSummaryRow>) }),
    ),
    transition: jest.fn(async (_org: string, _id: string, _from: string, to: string) =>
      taskRow({ ...existing, status: to as TaskSummaryRow['status'] }),
    ),
  };
  const events = { changed: jest.fn(async () => undefined), notify: jest.fn(async () => undefined) };
  const prisma = { projectWorkPlanPoint: { findMany: jest.fn(async () => points) } };
  const service = new WorkPlanTasksService(
    tasks as unknown as TasksRepository,
    events as unknown as TaskEventsService,
    prisma as unknown as PrismaService,
  );
  return { service, tasks, events };
}

function plan(assignedToId: string | null, points: Array<{ status: string; isError: boolean }>) {
  return {
    assignedToId: null,
    priority: null,
    phases: [
      {
        heading: 'Phase 1',
        assignedToId: null,
        priority: null,
        titles: [
          {
            id: 'title-1',
            title: 'Login',
            assignedToId,
            priority: null,
            points: points.map((point, index) => ({
              ...point,
              body: `Step ${index + 1}`,
              estimateMinutes: 30,
            })),
          },
        ],
      },
    ],
  } as unknown as WorkPlanRow;
}

const project = { id: 'project-1', members: [] } as unknown as ProjectRow;

describe('WorkPlanTasksService', () => {
  it('turns a new topic with nobody on it into a Draft task', async () => {
    const { service, tasks, events } = setup(null, []);
    await service.sync(lead, project, plan(null, [step(S.PENDING)]));

    expect(tasks.create).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        status: TASK_STATUS.DRAFT,
        assignedToId: null,
        workPlanTitleId: 'title-1',
      }),
    );
    expect(events.notify).not.toHaveBeenCalled();
  });

  it('creates an assigned topic as Assigned and tells the developer', async () => {
    const { service, tasks, events } = setup(null, []);
    await service.sync(lead, project, plan(DEV, [step(S.PENDING)]));

    expect(tasks.create).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ status: TASK_STATUS.ASSIGNED, assignedToId: DEV }),
    );
    expect(events.notify).toHaveBeenCalled();
  });

  it('moves the task to In progress when the developer starts a step', async () => {
    const { service, tasks, events } = setup(taskRow(), [step(S.IN_PROGRESS)]);
    await service.follow(lead, 'title-1');

    expect(tasks.transition).toHaveBeenCalledWith(
      ORG,
      'task-1',
      TASK_STATUS.ASSIGNED,
      TASK_STATUS.IN_PROGRESS,
      lead.userId,
      'Follows the project summary',
      expect.objectContaining({ startedAt: expect.any(Date), completedAt: null }),
    );
    expect(events.changed).toHaveBeenCalledWith(
      lead,
      expect.anything(),
      AUDIT_ACTION.TASK_STATUS_CHANGED,
      expect.objectContaining({ to: TASK_STATUS.IN_PROGRESS }),
    );
  });

  it('completes the task only when the tester passes it', async () => {
    const { service, tasks } = setup(taskRow({ status: TASK_STATUS.IN_REVIEW }), [
      step(S.COMPLETED),
    ]);
    await service.follow(lead, 'title-1');

    expect(tasks.transition).toHaveBeenCalledWith(
      ORG,
      'task-1',
      TASK_STATUS.IN_REVIEW,
      TASK_STATUS.COMPLETED,
      lead.userId,
      'Follows the project summary',
      expect.objectContaining({ completedAt: expect.any(Date) }),
    );
  });

  it('leaves the task alone when the status already matches, or it was cancelled', async () => {
    const same = setup(taskRow({ status: TASK_STATUS.IN_REVIEW }), [step(S.TESTING)]);
    await same.service.follow(lead, 'title-1');
    expect(same.tasks.transition).not.toHaveBeenCalled();

    const cancelled = setup(taskRow({ status: TASK_STATUS.CANCELLED }), [step(S.IN_PROGRESS)]);
    await cancelled.service.follow(lead, 'title-1');
    expect(cancelled.tasks.transition).not.toHaveBeenCalled();
  });

  it('keeps an in-progress task in step with the Summary on save', async () => {
    const { service, tasks } = setup(taskRow({ status: TASK_STATUS.IN_PROGRESS }), []);
    await service.sync(lead, project, plan(DEV, [step(S.RETURNED), step(S.PENDING, true)]));

    expect(tasks.transition).toHaveBeenCalledWith(
      ORG,
      'task-1',
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.RETURNED_TO_DEV,
      lead.userId,
      'Follows the project summary',
      expect.anything(),
    );
  });
});
