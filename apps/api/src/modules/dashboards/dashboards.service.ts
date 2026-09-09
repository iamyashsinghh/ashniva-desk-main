import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  isClientRole,
  type AuthenticatedUser,
  type DashboardResponse,
  type PermissionKey,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { ClientUpdatesRepository } from '../client-updates/client-updates.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { ProjectsRepository } from '../projects/projects.repository';
import { TaskVisibilityService } from '../tasks/task-visibility.service';
import { OrganizationMembershipsRepository } from '../organization-memberships/organization-memberships.repository';
import {
  buildDeveloperDashboard,
  buildManagementDashboard,
  buildSeniorDashboard,
  buildTesterDashboard,
} from './dashboard-builders';
import { buildEmployeeDashboard, buildSupportDashboard } from './support-dashboard.builders';
import { buildOperationsDashboard } from './operations/operations-dashboard.builder';
import { DashboardQueries, dashboardContext } from './dashboard-queries';

/**
 * Which payload a request is asking for.
 *
 * `role` is the historical behaviour of `GET /dashboard` and stays exactly as it was; `operations`
 * is package 7b's wider view, on its own route so that adding it changed nobody's home screen.
 */
export const DASHBOARD_VIEW = { ROLE: 'role', OPERATIONS: 'operations' } as const;

export type DashboardView = (typeof DASHBOARD_VIEW)[keyof typeof DASHBOARD_VIEW];

export type DashboardKind =
  'management' | 'senior' | 'tester' | 'support' | 'developer' | 'employee';

/**
 * Which home screen somebody gets, decided by what they may do rather than by the name of their
 * role.
 *
 * Custom roles are a shipped feature, and a custom role reports the system role it was cloned
 * from as its `roleKey` for the life of that role — while its permissions are edited freely
 * afterwards. Switching on the key therefore handed the organization-wide management dashboard
 * to a role cloned from Project Manager and then stripped back to reading tickets, which is the
 * one thing the roles editor exists to prevent.
 *
 * The order is widest first, and each rung is a key only the roles above it and its own hold, so
 * every default role lands exactly where it landed before:
 * Super Admin and Project Manager on management (`report:read-all`), Team Lead on senior
 * (`task:review`), Tester on tester (`qa:record-result`), Support Executive on support
 * (`ticket:triage`), Developer on developer (`task:work`), Internal Employee on employee.
 */
export function dashboardKindFor(actor: AuthenticatedUser): DashboardKind {
  const has = (permission: PermissionKey) => actor.permissions.includes(permission);
  if (has(PERMISSIONS.REPORT_READ_ALL)) return 'management';
  if (has(PERMISSIONS.TASK_REVIEW)) return 'senior';
  if (has(PERMISSIONS.QA_RECORD_RESULT)) return 'tester';
  if (has(PERMISSIONS.TICKET_TRIAGE)) return 'support';
  if (has(PERMISSIONS.TASK_WORK)) return 'developer';
  // Whoever is left works here but does not work *in* here: their own tickets and nothing else.
  // This used to be the developer dashboard, which asked for tasks they cannot read.
  return 'employee';
}

/** One endpoint, one payload per role; the client portal has its own overview. */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projects: ProjectsRepository,
    private readonly updates: ClientUpdatesRepository,
    private readonly organizations: OrganizationsRepository,
    private readonly memberships: OrganizationMembershipsRepository,
    private readonly visibility: TaskVisibilityService,
  ) {}

  async forUser(
    actor: AuthenticatedUser,
    view: DashboardView = DASHBOARD_VIEW.ROLE,
  ): Promise<DashboardResponse> {
    if (isClientRole(actor.roleKey)) {
      throw new ForbiddenException('Client organizations use the portal overview');
    }
    if (view === DASHBOARD_VIEW.OPERATIONS) {
      // The role gate lives in `resolveOperationsScope`, next to the scope it decides, so the two
      // cannot be changed apart.
      const queries = new DashboardQueries(
        this.prisma,
        dashboardContext(actor.organizationId, actor.userId),
        await this.visibility.taskWhere(actor),
      );
      return buildOperationsDashboard(
        queries,
        { prisma: this.prisma, projects: this.projects },
        actor,
      );
    }
    const kind = dashboardKindFor(actor);
    if (kind === 'employee') {
      const provider = await this.organizations.findServiceProvider();
      if (!provider) {
        throw new NotFoundException('Service provider organization is not configured');
      }
      const queries = new DashboardQueries(
        this.prisma,
        dashboardContext(provider.id, actor.userId),
      );
      return buildEmployeeDashboard(queries, actor.userId, actor.organizationId);
    }

    // One scope for every card on the page, so a tester's "Reopened" list and a lead's "Delayed"
    // count reach exactly as far as `GET /tasks` would for the same person.
    const queries = new DashboardQueries(
      this.prisma,
      dashboardContext(actor.organizationId, actor.userId),
      await this.visibility.taskWhere(actor),
    );
    const deps = { prisma: this.prisma, projects: this.projects, updates: this.updates };
    switch (kind) {
      case 'management':
        return buildManagementDashboard(queries, deps);
      case 'senior': {
        const membership = await this.memberships.findActiveMembership(
          actor.userId,
          actor.organizationId,
        );
        return buildSeniorDashboard(queries, deps, membership?.showDevelopmentSection ?? true);
      }
      case 'tester':
        return buildTesterDashboard(queries, deps);
      case 'support':
        return buildSupportDashboard(queries);
      case 'developer':
        return buildDeveloperDashboard(queries);
    }
  }
}
