import {
  PERMISSIONS,
  type AuthenticatedUser,
  type OperationsAvailabilityEntry,
  type OperationsCost,
  type OperationsDashboard,
  type OperationsTeamMember,
  type PermissionKey,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectsRepository } from '../../projects/projects.repository';
import type { DashboardQueries } from '../dashboard-queries';
import { buildOperationsAvailability } from './operations-availability.builder';
import { buildOperationsCost } from './operations-cost.builder';
import { operationsFilters } from './operations-filters';
import { loadOperationsMembers } from './operations-members';
import { buildOperationsProjects } from './operations-projects.builder';
import { buildOperationsRelease } from './operations-release.builder';
import { buildOperationsSupport } from './operations-support.builder';
import { buildOperationsTeam } from './operations-team.builder';
import { buildOperationsTime } from './operations-time.builder';
import { buildOperationsToday } from './operations-today.builder';
import { resolveOperationsScope } from './operations-scope';

export interface OperationsDeps {
  prisma: PrismaService;
  projects: ProjectsRepository;
}

/**
 * Which permission each optional section stands behind.
 *
 * Every one of these is the key that guards the same data on its own endpoint, and the point of
 * naming them together is that the list can be read: a dashboard that shows something the caller
 * could not have fetched for themselves is a way around the guard, not a convenience.
 */
export const OPERATIONS_SECTION_PERMISSIONS = {
  /** Per-person load — the same scope `report:read-team` opens on the reports screen. */
  team: PERMISSIONS.REPORT_READ_TEAM,
  /** Availability, rota and on-call cover — the support-routing configuration screens. */
  availability: PERMISSIONS.SUPPORT_ROUTING_MANAGE,
  /** Internal cost, which the contracts module refuses to anybody without it. */
  cost: PERMISSIONS.COST_READ,
} as const satisfies Record<string, PermissionKey>;

function may(actor: AuthenticatedUser, permission: PermissionKey): boolean {
  return actor.permissions.includes(permission);
}

/**
 * Package 7b: what is happening across a manager's or team lead's permitted projects.
 *
 * The scope is decided from the role and applied in every query; the optional sections are
 * decided from the caller's permissions and **omitted** rather than emptied, so an absent section
 * cannot be read off the wire as "you have none of these".
 */
export async function buildOperationsDashboard(
  q: DashboardQueries,
  deps: OperationsDeps,
  actor: AuthenticatedUser,
  now = new Date(),
): Promise<OperationsDashboard> {
  const resolved = await resolveOperationsScope(deps, actor);
  const filters = operationsFilters(resolved);
  const { organizationId, today } = q.ctx;
  const wantsTeam = may(actor, OPERATIONS_SECTION_PERMISSIONS.team);
  const wantsAvailability = may(actor, OPERATIONS_SECTION_PERMISSIONS.availability);

  // Read once and shared: both people-shaped sections describe the same team, and either of them
  // can be absent without changing who that is.
  const members =
    wantsTeam || wantsAvailability
      ? await loadOperationsMembers(deps.prisma, organizationId, resolved.memberIds)
      : [];

  const [projects, todayCounts, time, support, release, team, availability, cost] =
    await Promise.all([
      buildOperationsProjects(deps, organizationId, today, resolved.projects),
      buildOperationsToday(q, filters, now),
      buildOperationsTime(q, deps.prisma, filters, now, wantsTeam),
      buildOperationsSupport(q, deps.prisma, filters, wantsAvailability, now),
      buildOperationsRelease(deps.prisma, organizationId, filters),
      wantsTeam
        ? buildOperationsTeam(q, deps.prisma, members)
        : Promise.resolve<OperationsTeamMember[] | null>(null),
      wantsAvailability
        ? buildOperationsAvailability(
            deps.prisma,
            organizationId,
            today,
            members,
            filters.projectIds,
            now,
          )
        : Promise.resolve<OperationsAvailabilityEntry[] | null>(null),
      may(actor, OPERATIONS_SECTION_PERMISSIONS.cost)
        ? buildOperationsCost(deps.prisma, organizationId, filters)
        : Promise.resolve<OperationsCost[] | null>(null),
    ]);

  return {
    kind: 'operations',
    scope: resolved.scope,
    projects,
    today: todayCounts,
    time,
    support,
    release,
    ...(team ? { team } : {}),
    ...(availability ? { availability } : {}),
    ...(cost ? { cost } : {}),
  };
}
