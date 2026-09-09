import { ForbiddenException } from '@nestjs/common';
import {
  OPERATIONS_SCOPE,
  PERMISSIONS,
  PROJECT_STATUS,
  type AuthenticatedUser,
  type OperationsScope,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type { ProjectRow, ProjectsRepository } from '../../projects/projects.repository';
import { teamPeerIds } from '../../tasks/task-list-filter';

export interface OperationsScopeDeps {
  prisma: PrismaService;
  projects: ProjectsRepository;
}

export interface ResolvedOperationsScope {
  scope: OperationsScope;
  /** The project rows themselves, so the project grid does not fetch them a second time. */
  projects: ProjectRow[];
  /**
   * Assignee narrowing for the Today and Team sections. `undefined` means "everybody in the
   * organization" — an absent filter, not an empty one, which would select nothing.
   */
  memberIds: string[] | undefined;
}

/**
 * Who may open the operational dashboard, and how much of the organization it shows them.
 *
 * The permission decides the width and the server applies it; the web app is only ever told what
 * it already received. `project:manage` is the key the three manager roles hold and nobody else
 * does — it is what creating and editing a project asks for, which is the same authority this
 * board assumes. It replaces `isManagerRole(actor.roleKey)`: a custom role reports the system
 * role it was cloned from for ever, so the role key said "manager" for a role whose permissions
 * had since been cut back to nothing, and said "not a manager" for nobody at all.
 *
 * A Team Lead sees the projects they manage, lead or belong to. A Project Manager and a Super
 * Admin see the organization, because that is what their `report:read-all` already reaches —
 * narrowing the dashboard below the lists it links to would only make the two disagree.
 */
/**
 * The most projects the operational grid will render.
 *
 * A ceiling rather than pagination: the grid is a survey, and a manager with more than this many
 * active projects needs the project list, not a longer dashboard.
 */
export const MAX_OPERATIONS_PROJECTS = 200;

export async function resolveOperationsScope(
  deps: OperationsScopeDeps,
  actor: AuthenticatedUser,
): Promise<ResolvedOperationsScope> {
  if (!actor.permissions.includes(PERMISSIONS.PROJECT_MANAGE)) {
    throw new ForbiddenException('The operational dashboard is for managers and team leads');
  }
  // Organization-wide for whoever may already read every report; the team's own work otherwise.
  const teamScoped = !actor.permissions.includes(PERMISSIONS.REPORT_READ_ALL);
  // Bounded. Every one of these is rendered into the project grid, with its members, so an
  // organization-wide caller on a large installation was fetching the largest object in the
  // response with no ceiling at all. The cap is generous enough that no real installation reaches
  // it today, and it is what stops the grid growing without anybody deciding that it should.
  const projects = (
    await deps.projects.list({
      organizationId: actor.organizationId,
      status: PROJECT_STATUS.ACTIVE,
      ...(teamScoped ? { memberUserId: actor.userId } : {}),
    })
  ).slice(0, MAX_OPERATIONS_PROJECTS);
  // `teamPeerIds` keeps the lead; `DashboardQueries.teamPeersExcludingSelf` drops them, because
  // its caller lists the people the lead oversees. This is the first one — every card in Today and
  // Team links to `GET /tasks?view=team`, and that view selects exactly this set.
  const memberIds = teamScoped
    ? await teamPeerIds(deps.prisma, actor.organizationId, actor.userId)
    : undefined;
  return {
    projects,
    memberIds,
    scope: {
      kind: teamScoped ? OPERATIONS_SCOPE.TEAM : OPERATIONS_SCOPE.ORGANIZATION,
      projectIds: projects.map((project) => project.id),
      taskListView: teamScoped ? 'team' : 'all',
    },
  };
}
