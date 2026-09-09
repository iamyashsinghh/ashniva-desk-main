import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  type AuthenticatedUser,
  type PermissionKey,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectsRepository } from '../../projects/projects.repository';
import { DashboardQueries, dashboardContext } from '../dashboard-queries';
import {
  OPERATIONS_SECTION_PERMISSIONS,
  buildOperationsDashboard,
} from './operations-dashboard.builder';

/**
 * Every model answers "nothing", so the only thing these assertions can be reading is the shape of
 * the payload — which section is present and which is absent — rather than any seeded row.
 */
const EMPTY_RESULT: Record<string, unknown> = {
  findMany: [],
  findFirst: null,
  count: 0,
  groupBy: [],
  aggregate: { _sum: {} },
};

function emptyPrisma(): PrismaService {
  const model = new Proxy(
    {},
    {
      get: (_target, method: string) => () => Promise.resolve(EMPTY_RESULT[method] ?? null),
    },
  );
  return new Proxy({}, { get: () => model }) as unknown as PrismaService;
}

const projects = {
  list: jest.fn().mockResolvedValue([]),
  countsByProject: jest.fn().mockResolvedValue(new Map()),
} as unknown as ProjectsRepository;

/**
 * `project:manage` is the key that opens this dashboard at all, so every actor here holds it and
 * the listed permissions are the only variable. It used to be the role name that let them in;
 * these are section tests, and the entry gate is `operations-scope.spec.ts`'s subject.
 */
function actorWith(
  roleKey: AuthenticatedUser['roleKey'],
  permissions: readonly PermissionKey[],
): AuthenticatedUser {
  return {
    userId: 'user-lead',
    organizationId: 'org-ashniva',
    roleKey,
    permissions: [PERMISSIONS.PROJECT_MANAGE, ...permissions],
    isServiceProvider: true,
  };
}

function build(actor: AuthenticatedUser) {
  const prisma = emptyPrisma();
  const queries = new DashboardQueries(prisma, dashboardContext('org-ashniva', actor.userId));
  return buildOperationsDashboard(queries, { prisma, projects }, actor);
}

describe('operational dashboard sections and the permissions behind them', () => {
  it('never gates the sections a manager may always see', async () => {
    const payload = await build(actorWith(ROLE_KEYS.PROJECT_MANAGER, []));

    expect(payload.kind).toBe('operations');
    for (const section of ['projects', 'today', 'time', 'support', 'release'] as const) {
      expect(payload[section]).toBeDefined();
    }
  });

  it.each(Object.entries(OPERATIONS_SECTION_PERMISSIONS))(
    'omits %s without %s, and includes it with',
    async (section, permission) => {
      const without = await build(actorWith(ROLE_KEYS.PROJECT_MANAGER, []));
      const with_ = await build(actorWith(ROLE_KEYS.PROJECT_MANAGER, [permission]));

      // Absent, not null and not empty: a null would still tell the reader the section exists and
      // that they have none of it, which is a fact they were not granted.
      expect(section in without).toBe(false);
      expect(section in with_).toBe(true);
    },
  );

  it('omits the routing configuration with the same key that hides availability', async () => {
    const without = await build(actorWith(ROLE_KEYS.TEAM_LEAD, []));
    const with_ = await build(actorWith(ROLE_KEYS.TEAM_LEAD, [PERMISSIONS.SUPPORT_ROUTING_MANAGE]));

    expect('routing' in without.support).toBe(false);
    expect(with_.support.routing).toEqual([]);
  });

  // The point of this one is the direction of the check: the dashboard may only ever show less
  // than the caller's own endpoints would, never more.
  it('shows a team lead no more than their own permission set allows', async () => {
    const payload = await build(
      actorWith(ROLE_KEYS.TEAM_LEAD, DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.TEAM_LEAD]),
    );

    expect(payload.team).toBeDefined();
    expect(payload.availability).toBeDefined();
    // A Team Lead has no cost:read by default, and the costs section is absent because of it.
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.TEAM_LEAD]).not.toContain(PERMISSIONS.COST_READ);
    expect('cost' in payload).toBe(false);
  });
});
