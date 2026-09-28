import { NOTIFICATION_TYPE, ROLE_KEYS, WORK_PLAN_POINT_STATUS } from '@ashniva/types';

import { WorkTimeMonitorService } from './work-time-monitor.service';

describe('WorkTimeMonitorService', () => {
  it('notifies the project manager and Super Admins once per overdue work-plan point', async () => {
    const pointId = 'point-1';
    const projectId = 'project-1';
    const orgId = 'org-1';
    const managerId = 'manager-1';
    const saId = 'sa-1';
    const workerId = 'worker-1';
    const dueAt = new Date('2026-09-25T10:00:00.000Z');
    const now = new Date('2026-09-25T10:45:00.000Z');

    const prisma = {
      projectWorkPlanPoint: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: pointId,
            body: 'Build login API',
            estimateMinutes: 30,
            dueAt,
            startedById: workerId,
            startedBy: { id: workerId, name: 'Dev One' },
            title: {
              title: 'Auth',
              phase: {
                heading: 'Phase 1',
                plan: {
                  project: {
                    id: projectId,
                    code: 'PRJ',
                    name: 'Demo',
                    organizationId: orgId,
                    managerUserId: managerId,
                  },
                },
              },
            },
          },
        ]),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const notified: unknown[] = [];
    const dispatcher = {
      notify: jest.fn(async (input: unknown) => {
        notified.push(input);
        return { created: 1, grouped: 0, skipped: 0, deferred: 0 };
      }),
    };

    const recipients = {
      member: jest.fn(async () => [{ userId: managerId, organizationId: orgId }]),
      withRoleKey: jest.fn(async () => [{ userId: saId, organizationId: orgId }]),
    };

    const tenantContext = {
      runAsSystem: <T>(fn: () => Promise<T>) => fn(),
    };

    const service = new WorkTimeMonitorService(
      prisma as never,
      dispatcher as never,
      recipients as never,
      tenantContext as never,
    );

    const result = await service.run(now);

    expect(result).toEqual({ workPlanPoints: 1, tasks: 0, notified: 1 });
    expect(prisma.projectWorkPlanPoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: WORK_PLAN_POINT_STATUS.IN_PROGRESS,
          dueAt: { lte: now },
          pausedRemainingSeconds: null,
        }),
      }),
    );
    expect(recipients.withRoleKey).toHaveBeenCalledWith(orgId, ROLE_KEYS.SUPER_ADMIN);
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({
      type: NOTIFICATION_TYPE.WORK_PLAN_TIME_EXCEEDED,
      title: 'Time exceeded on PRJ',
      link: `/projects/${projectId}`,
      entityId: pointId,
      dedupeKey: `work-plan-time-exceeded:${pointId}`,
      excludeUserId: workerId,
      recipients: [
        { userId: managerId, organizationId: orgId },
        { userId: saId, organizationId: orgId },
      ],
    });
    expect((notified[0] as { body: string }).body).toContain('Dev One');
    expect((notified[0] as { body: string }).body).toContain('30 min');
  });

  it('notifies managers when a started task runs past its estimate', async () => {
    const taskId = 'task-1';
    const orgId = 'org-1';
    const managerId = 'manager-1';
    const startedAt = new Date('2026-09-25T09:00:00.000Z');
    const now = new Date('2026-09-25T10:30:00.000Z');

    const prisma = {
      projectWorkPlanPoint: { findMany: jest.fn().mockResolvedValue([]) },
      task: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: taskId,
            number: 12,
            title: 'Fix login bug',
            estimateMinutes: 60,
            startedAt,
            assignedToId: 'dev-1',
            assignedTo: { id: 'dev-1', name: 'Dev One' },
            project: {
              id: 'project-1',
              code: 'PRJ',
              organizationId: orgId,
              managerUserId: managerId,
            },
          },
        ]),
      },
    };

    const notified: unknown[] = [];
    const dispatcher = {
      notify: jest.fn(async (input: unknown) => {
        notified.push(input);
        return { created: 1, grouped: 0, skipped: 0, deferred: 0 };
      }),
    };
    const recipients = {
      member: jest.fn(async () => [{ userId: managerId, organizationId: orgId }]),
      withRoleKey: jest.fn(async () => []),
    };
    const tenantContext = { runAsSystem: <T>(fn: () => Promise<T>) => fn() };

    const service = new WorkTimeMonitorService(
      prisma as never,
      dispatcher as never,
      recipients as never,
      tenantContext as never,
    );

    const result = await service.run(now);
    expect(result).toEqual({ workPlanPoints: 0, tasks: 1, notified: 1 });
    expect(notified[0]).toMatchObject({
      type: NOTIFICATION_TYPE.TASK_TIME_EXCEEDED,
      dedupeKey: `task-time-exceeded:${taskId}`,
      link: `/tasks/${taskId}`,
    });
  });
});
