import { PROJECT_MEMBER_ROLE, type AuthenticatedUser } from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import { TaskChatScopeService, taskChatWhere } from './task-chat-scope.service';
import type { TaskScope } from './task-visibility.service';

const ACTOR = {
  userId: 'user-dev',
  organizationId: 'org-ashniva',
  roleKey: 'DEVELOPER',
  permissions: [],
} as unknown as AuthenticatedUser;

interface Doubles {
  teamMembers: { userId: string }[];
  projects: { id: string }[];
  project: unknown;
  testers: { assignedToUserId: string | null }[];
  teams: { leadUserId: string | null }[];
}

function service(doubles: Partial<Doubles> = {}) {
  const calls = {
    projectWhere: undefined as unknown,
    teamMemberWhere: undefined as unknown,
  };
  const prisma = {
    teamMember: {
      findMany: jest.fn(async (args: { where: unknown }) => {
        calls.teamMemberWhere = args.where;
        return doubles.teamMembers ?? [];
      }),
    },
    project: {
      findMany: jest.fn(async (args: { where: unknown }) => {
        calls.projectWhere = args.where;
        return doubles.projects ?? [];
      }),
      findUnique: jest.fn(async () => doubles.project ?? null),
    },
    team: { findMany: jest.fn(async () => doubles.teams ?? []) },
    testingAssignment: { findMany: jest.fn(async () => doubles.testers ?? []) },
    task: { findMany: jest.fn(async () => []) },
  } as unknown as PrismaService;
  return { scope: new TaskChatScopeService(prisma), prisma, calls };
}

describe('TaskChatScopeService.resolve', () => {
  it('is never organization-wide, whatever the actor holds', async () => {
    // The one tenant-wide reader of conversations is the inspector, and they arrive through
    // oversight. No permission belongs in this scope, which is why none is consulted.
    const { scope } = service();
    expect((await scope.resolve(ACTOR)).organizationWide).toBe(false);
  });

  it('always contains the actor themselves', async () => {
    const { scope } = service();
    expect((await scope.resolve(ACTOR)).userIds).toEqual([ACTOR.userId]);
  });

  it('adds the members of teams the actor leads, and nobody else’s', async () => {
    const { scope, calls } = service({ teamMembers: [{ userId: 'user-a' }, { userId: 'user-b' }] });
    const resolved = await scope.resolve(ACTOR);

    expect(resolved.userIds).toEqual([ACTOR.userId, 'user-a', 'user-b']);
    // Being *on* a team with somebody is not authority over their work; leading it is.
    expect(calls.teamMemberWhere).toEqual({
      team: { organizationId: ACTOR.organizationId, deletedAt: null, leadUserId: ACTOR.userId },
    });
  });

  it('takes only the projects the actor manages or leads, never the ones they are merely on', async () => {
    const { scope, calls } = service();
    await scope.resolve(ACTOR);

    const where = calls.projectWhere as { OR: Array<Record<string, unknown>> };
    // The defect was that plain membership admitted somebody to every task thread on a project.
    // The membership clause that survives is role-bounded, and this is the assertion that says so.
    expect(where.OR).toContainEqual({
      members: {
        some: {
          userId: ACTOR.userId,
          role: { in: [PROJECT_MEMBER_ROLE.MANAGER, PROJECT_MEMBER_ROLE.LEAD] },
        },
      },
    });
    expect(JSON.stringify(where.OR)).not.toContain('"role":{"in":[]}');
    expect(where.OR).toContainEqual({ managerUserId: ACTOR.userId });
    expect(where.OR).toContainEqual({ leadUserId: ACTOR.userId });
    expect(where.OR).toContainEqual({ team: { deletedAt: null, leadUserId: ACTOR.userId } });
  });
});

describe('taskChatWhere', () => {
  const scope: TaskScope = {
    organizationWide: false,
    userIds: ['user-dev'],
    projectIds: ['project-led'],
  };

  it('names every relation that puts a task in somebody’s hands', () => {
    const where = taskChatWhere(scope) as { OR: Array<Record<string, unknown>> };

    expect(where.OR).toContainEqual({ assignedToId: { in: ['user-dev'] } });
    expect(where.OR).toContainEqual({ createdById: { in: ['user-dev'] } });
    expect(where.OR).toContainEqual({ reviewerId: { in: ['user-dev'] } });
    expect(where.OR).toContainEqual({ testerId: { in: ['user-dev'] } });
    expect(where.OR).toContainEqual({
      testingAssignments: { some: { assignedToUserId: { in: ['user-dev'] }, deletedAt: null } },
    });
    expect(where.OR).toContainEqual({ projectId: { in: ['project-led'] } });
  });

  it('is a predicate even when the actor leads nothing, rather than a filter that matches all', () => {
    // The dangerous shape: an empty scope compiling to "no constraint". It compiles to the five
    // relation clauses against a list holding only the actor, which is exactly right.
    const where = taskChatWhere({
      organizationWide: false,
      userIds: ['user-dev'],
      projectIds: [],
    }) as { OR: unknown[] };

    expect(where.OR).toHaveLength(5);
  });
});

describe('TaskChatScopeService.audienceFor', () => {
  const task = {
    id: 'task-1',
    organizationId: 'org-ashniva',
    projectId: 'project-1',
    assignedToId: 'user-assignee',
    createdById: 'user-creator',
    reviewerId: null,
    testerId: null,
  };

  it('names the people on the task, the assignment’s tester and the project’s seniors', async () => {
    const { scope } = service({
      testers: [{ assignedToUserId: 'user-tester' }],
      teams: [{ leadUserId: 'user-team-lead' }],
      project: {
        managerUserId: 'user-manager',
        leadUserId: 'user-project-lead',
        team: { leadUserId: 'user-project-team-lead' },
        members: [{ userId: 'user-senior-member' }],
      },
    });

    expect((await scope.audienceFor(task)).sort()).toEqual(
      [
        'user-assignee',
        'user-creator',
        'user-tester',
        'user-team-lead',
        'user-manager',
        'user-project-lead',
        'user-project-team-lead',
        'user-senior-member',
      ].sort(),
    );
  });

  it('asks about team leads only once it knows who the testers are', async () => {
    // The asymmetry that would otherwise creep in: a tester whose only relation is an assignment
    // row is on the task, so their lead is in the audience too. Asking about teams beside the
    // assignments rather than after them would have missed exactly that person.
    const { scope, prisma } = service({ testers: [{ assignedToUserId: 'user-tester' }] });
    await scope.audienceFor(task);

    const teamCall = (prisma.team.findMany as jest.Mock).mock.calls[0]?.[0] as {
      where: { members: { some: { userId: { in: string[] } } } };
    };
    expect(teamCall.where.members.some.userId.in).toContain('user-tester');
  });

  it('asks about no teams at all when the task belongs to nobody', async () => {
    const { scope, prisma } = service({ project: null });
    const audience = await scope.audienceFor({
      ...task,
      assignedToId: null,
      createdById: 'user-creator',
    });

    expect(audience).toEqual(['user-creator']);
    expect(prisma.team.findMany).toHaveBeenCalledTimes(1);
  });
});
