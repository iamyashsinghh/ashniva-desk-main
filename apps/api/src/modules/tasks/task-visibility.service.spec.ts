import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS, ROLE_KEYS, type AuthenticatedUser } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import { TaskVisibilityService, taskScopeWhere } from './task-visibility.service';

interface Doubles {
  teams: { members: { userId: string }[] }[];
  projects: { id: string }[];
}

const actorWith = (
  permissions: string[],
  roleKey: string = ROLE_KEYS.DEVELOPER,
): AuthenticatedUser =>
  ({
    userId: 'user-dev',
    organizationId: 'org-ashniva',
    roleKey,
    permissions,
  }) as unknown as AuthenticatedUser;

function service(doubles: Partial<Doubles> = {}): TaskVisibilityService {
  const prisma = {
    team: { findMany: jest.fn().mockResolvedValue(doubles.teams ?? []) },
    project: {
      findMany: jest.fn().mockResolvedValue(doubles.projects ?? []),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaService;
  return new TaskVisibilityService(prisma);
}

describe('TaskVisibilityService.resolve', () => {
  it('reads the whole organization only for Super Admin with task:read-all', async () => {
    const scope = await service().resolve(
      actorWith([PERMISSIONS.TASK_READ_ALL], ROLE_KEYS.SUPER_ADMIN),
    );
    expect(scope.organizationWide).toBe(true);
  });

  it('does not let a project manager with task:read-all see other teams’ projects', async () => {
    const scope = await service().resolve(
      actorWith([PERMISSIONS.TASK_READ_ALL], ROLE_KEYS.PROJECT_MANAGER),
    );
    expect(scope.organizationWide).toBe(false);
    expect(scope.userIds).toEqual(['user-dev']);
  });

  // The defect: `task:read` said a person works with tasks, and the API read it as "everybody's".
  it('does not widen the scope for task:read on its own', async () => {
    const scope = await service().resolve(actorWith([PERMISSIONS.TASK_READ]));
    expect(scope.organizationWide).toBe(false);
    expect(scope.userIds).toEqual(['user-dev']);
    expect(scope.projectIds).toEqual([]);
  });

  it('adds the members of teams the actor leads, and nobody else', async () => {
    const scope = await service({
      teams: [{ members: [{ userId: 'user-dev' }, { userId: 'user-junior' }] }],
    }).resolve(actorWith([PERMISSIONS.TASK_READ]));
    expect(new Set(scope.userIds)).toEqual(new Set(['user-dev', 'user-junior']));
  });

  it('adds the projects the actor manages, leads or belongs to', async () => {
    const scope = await service({ projects: [{ id: 'project-a' }, { id: 'project-b' }] }).resolve(
      actorWith([PERMISSIONS.TASK_READ]),
    );
    expect(scope.projectIds).toEqual(['project-a', 'project-b']);
  });

  it('asks only for teams the actor leads — being on a team is not authority over it', async () => {
    const prisma = {
      team: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    await new TaskVisibilityService(prisma).resolve(actorWith([PERMISSIONS.TASK_READ]));
    const where = (prisma.team.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.leadUserId).toBe('user-dev');
    expect(where.members).toBeUndefined();
  });
});

describe('taskScopeWhere', () => {
  it('is absent for an organization-wide reader, so nothing narrows the query', () => {
    expect(taskScopeWhere({ organizationWide: true, userIds: [], projectIds: [] })).toBeUndefined();
  });

  it('covers every way the schema records that a task is somebody’s', () => {
    const where = taskScopeWhere({
      organizationWide: false,
      userIds: ['user-dev'],
      projectIds: [],
    });
    const keys = (where?.OR ?? []).flatMap((clause) => Object.keys(clause));
    expect(keys).toEqual(
      expect.arrayContaining([
        'assignedToId',
        'createdById',
        'reviewerId',
        'testerId',
        'testingAssignments',
      ]),
    );
  });

  it('omits the project clause entirely when there are no projects', () => {
    // `projectId: { in: [] }` matches nothing and is harmless; an omitted clause says the same
    // thing without asking the database to evaluate it.
    const where = taskScopeWhere({ organizationWide: false, userIds: ['u'], projectIds: [] });
    expect((where?.OR ?? []).some((clause) => 'projectId' in clause)).toBe(false);
  });

  it('includes the project clause when there are projects', () => {
    const where = taskScopeWhere({
      organizationWide: false,
      userIds: ['u'],
      projectIds: ['project-a'],
    });
    expect(where?.OR).toContainEqual({ projectId: { in: ['project-a'] } });
  });
});

describe('TaskVisibilityService.assertMayFilterBy', () => {
  it('allows the caller to filter by themselves', async () => {
    await expect(
      service().assertMayFilterBy(actorWith([PERMISSIONS.TASK_READ]), 'user-dev'),
    ).resolves.toBeUndefined();
  });

  it('allows Super Admin to name anybody', async () => {
    await expect(
      service().assertMayFilterBy(
        actorWith([PERMISSIONS.TASK_READ_ALL], ROLE_KEYS.SUPER_ADMIN),
        'user-stranger',
      ),
    ).resolves.toBeUndefined();
  });

  // `?assignedToId=` used to take any user id at all on the upcoming, today, overdue and done
  // views, and hand back that person's work.
  it('refuses a stranger rather than quietly returning nothing', async () => {
    await expect(
      service().assertMayFilterBy(actorWith([PERMISSIONS.TASK_READ]), 'user-stranger'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a colleague on one of the caller’s own projects', async () => {
    const prisma = {
      team: { findMany: jest.fn().mockResolvedValue([]) },
      project: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'project-a' }])
          .mockResolvedValueOnce([
            { managerUserId: null, leadUserId: null, members: [{ userId: 'user-colleague' }] },
          ]),
      },
    } as unknown as PrismaService;
    await expect(
      new TaskVisibilityService(prisma).assertMayFilterBy(
        actorWith([PERMISSIONS.TASK_READ]),
        'user-colleague',
      ),
    ).resolves.toBeUndefined();
  });
});
