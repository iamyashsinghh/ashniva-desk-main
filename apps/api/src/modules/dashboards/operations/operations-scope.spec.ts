import { ForbiddenException } from '@nestjs/common';
import {
  DEFAULT_ROLE_PERMISSIONS,
  OPERATIONS_SCOPE,
  PROJECT_STATUS,
  ROLE_KEYS,
  type AuthenticatedUser,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectsRepository } from '../../projects/projects.repository';
import { operationsFilters } from './operations-filters';
import { resolveOperationsScope } from './operations-scope';

/**
 * The role's real default permission set, because that is now what the resolver reads.
 *
 * It used to be handed a role key and an empty permission list, which is a person who cannot
 * exist: the width of this dashboard is decided by `project:manage` and `report:read-all`, and a
 * fixture that leaves them out tests a shape nobody is ever issued.
 */
const actorFor = (roleKey: AuthenticatedUser['roleKey']): AuthenticatedUser =>
  ({
    userId: 'user-lead',
    organizationId: 'org-ashniva',
    roleKey,
    permissions: [...DEFAULT_ROLE_PERMISSIONS[roleKey]],
  }) as unknown as AuthenticatedUser;

/** Two projects; only the second one has the lead on it. */
const PROJECT_ROWS = [
  { id: 'project-a', code: 'AAA', name: 'Alpha' },
  { id: 'project-b', code: 'BBB', name: 'Beta' },
];

function doubles(projectRows = PROJECT_ROWS) {
  const list = jest.fn().mockResolvedValue(projectRows);
  const findMany = jest.fn().mockResolvedValue([{ members: [{ userId: 'user-dev' }] }]);
  return {
    deps: {
      prisma: { team: { findMany } } as unknown as PrismaService,
      projects: { list } as unknown as ProjectsRepository,
    },
    list,
    findMany,
  };
}

describe('resolveOperationsScope', () => {
  it.each([ROLE_KEYS.DEVELOPER, ROLE_KEYS.TESTER, ROLE_KEYS.SUPPORT_EXECUTIVE])(
    'refuses %s, who manages nobody',
    async (roleKey) => {
      const { deps } = doubles();
      await expect(resolveOperationsScope(deps, actorFor(roleKey))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it.each([ROLE_KEYS.SUPER_ADMIN, ROLE_KEYS.PROJECT_MANAGER])(
    'gives %s the organization and no assignee narrowing',
    async (roleKey) => {
      const { deps, list, findMany } = doubles();
      const resolved = await resolveOperationsScope(deps, actorFor(roleKey));

      expect(list).toHaveBeenCalledWith({
        organizationId: 'org-ashniva',
        status: PROJECT_STATUS.ACTIVE,
      });
      expect(resolved.scope.kind).toBe(OPERATIONS_SCOPE.ORGANIZATION);
      expect(resolved.scope.taskListView).toBe('all');
      expect(resolved.scope.projectIds).toEqual(['project-a', 'project-b']);
      // An organization-wide caller is not narrowed to a team, so the team table is never read.
      expect(resolved.memberIds).toBeUndefined();
      expect(findMany).not.toHaveBeenCalled();
    },
  );

  it('gives a team lead only the projects they are on, and only their people', async () => {
    const { deps, list } = doubles([{ id: 'project-b', code: 'BBB', name: 'Beta' }]);
    const resolved = await resolveOperationsScope(deps, actorFor(ROLE_KEYS.TEAM_LEAD));

    expect(list).toHaveBeenCalledWith({
      organizationId: 'org-ashniva',
      status: PROJECT_STATUS.ACTIVE,
      memberUserId: 'user-lead',
    });
    expect(resolved.scope.kind).toBe(OPERATIONS_SCOPE.TEAM);
    expect(resolved.scope.projectIds).toEqual(['project-b']);
    expect(resolved.scope.taskListView).toBe('team');
  });

  // `teamPeerIds` and `teamPeersExcludingSelf` differ by exactly this. The one used here is
  // the task-list one, which keeps the lead, because every card links to `?view=team`.
  it('counts the lead among their own team, as the team task list does', async () => {
    const { deps } = doubles();
    const resolved = await resolveOperationsScope(deps, actorFor(ROLE_KEYS.TEAM_LEAD));
    expect(resolved.memberIds).toEqual(expect.arrayContaining(['user-lead', 'user-dev']));
  });
});

describe('operationsFilters', () => {
  it('leaves an organization-wide scope unfiltered rather than filtering on everything', async () => {
    const { deps } = doubles();
    const filters = operationsFilters(await resolveOperationsScope(deps, actorFor('SUPER_ADMIN')));

    expect(filters).toMatchObject({
      people: {},
      tickets: {},
      organizationWide: true,
    });
  });

  // An empty `in` list selects nothing at all, which is the opposite of "no narrowing" and the
  // shape a scope resolver is most likely to produce by accident.
  it('narrows a team lead by assignee and its tickets by project, never by an empty list', async () => {
    const { deps } = doubles();
    const filters = operationsFilters(await resolveOperationsScope(deps, actorFor('TEAM_LEAD')));

    expect(filters.organizationWide).toBe(false);
    expect(filters.people).toEqual({
      assignedToId: { in: expect.arrayContaining(['user-lead', 'user-dev']) },
    });
    expect(filters.tickets).toEqual({ projectId: { in: ['project-a', 'project-b'] } });
  });
});
