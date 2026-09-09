import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CLIENT_UPDATE_STATUS,
  OPEN_CHANGE_REQUEST_STATUSES,
  OPEN_TICKET_STATUSES,
  TASK_STATUS,
  TICKET_LIST_VIEW,
  TICKET_STATUS,
  VISIBILITY,
  type AuthenticatedUser,
  type PortalClientUpdate,
  type FileSummary,
  type PortalHome,
  type PortalProjectDetail,
  type PortalProjectSummary,
} from '@ashniva/types';

import { isClientUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { boundedList } from '../../common/dto/unpaginated-list';
import { ApprovalsService } from '../approvals/approvals.service';
import { ChangeRequestsRepository } from '../change-requests/change-requests.repository';
import { ClientUpdatesRepository } from '../client-updates/client-updates.repository';
import { PortalContractsService } from '../contracts/portal-contracts.service';
import { FilesRepository } from '../files/files.repository';
import { toFileSummary } from '../files/files.service';
import { MilestonesService } from '../milestones/milestones.service';
import { ProjectsRepository } from '../projects/projects.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { todayUtc } from '../tasks/tasks.mapper';
import { TicketsService } from '../tickets/tickets.service';
import {
  toPortalProject,
  toPortalTask,
  toPortalTicket,
  toPortalClientUpdate,
} from './portal.mapper';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything a client organization can see, scoped by clientOrganizationId = the caller's
 * organization and built through the allow-list mappers in portal.mapper.ts.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly projects: ProjectsRepository,
    private readonly tasks: TasksRepository,
    private readonly updates: ClientUpdatesRepository,
    private readonly files: FilesRepository,
    private readonly tickets: TicketsService,
    private readonly prisma: PrismaService,
    private readonly milestones: MilestonesService,
    private readonly contracts: PortalContractsService,
    private readonly approvals: ApprovalsService,
    private readonly changeRequests: ChangeRequestsRepository,
  ) {}

  async home(actor: AuthenticatedUser): Promise<PortalHome> {
    const providerId = await this.provider(actor);
    const today = todayUtc();
    const weekStart = new Date(today.getTime() - 6 * DAY_MS);
    const [projects, updates, ticketsPage, files, organization] = await Promise.all([
      this.listProjects(actor),
      this.updates.list({
        organizationId: providerId,
        clientOrganizationId: actor.organizationId,
        status: [CLIENT_UPDATE_STATUS.PUBLISHED],
        limit: 10,
      }),
      this.tickets.list(actor, { view: TICKET_LIST_VIEW.OPEN, limit: 50 }),
      this.files.list(providerId, {}, { visibility: VISIBILITY.CLIENT }),
      this.prisma.organization.findUniqueOrThrow({
        where: { id: actor.organizationId },
        select: { id: true, name: true, slug: true },
      }),
    ]);
    const [completedToday, completedThisWeek] = await Promise.all([
      this.countPublished(
        providerId,
        actor.organizationId,
        today,
        new Date(today.getTime() + DAY_MS),
      ),
      this.countPublished(
        providerId,
        actor.organizationId,
        weekStart,
        new Date(today.getTime() + DAY_MS),
      ),
    ]);
    const [contracts, approvals, changeRequests] = await Promise.all([
      this.contracts.list(actor),
      this.approvals.portalList(actor),
      this.changeRequests.list({
        organizationId: providerId,
        clientOrganizationId: actor.organizationId,
        hideDraftsExcept: actor.userId,
        status: [...OPEN_CHANGE_REQUEST_STATUSES],
        limit: 1,
      }),
    ]);
    const pendingApprovals = approvals.filter((approval) => approval.status === 'PUBLISHED');
    const activeContracts = contracts.filter((contract) => contract.status === 'ACTIVE');
    const hourContracts = activeContracts.filter((contract) => contract.hours !== null);
    const openTickets = ticketsPage.items.map(toPortalTicket);
    const active = projects.filter((project) => project.status === 'ACTIVE');
    const overall = active.length
      ? Math.round(
          active.reduce((sum, project) => sum + project.progressPercent, 0) / active.length,
        )
      : 0;
    return {
      organization,
      kpis: {
        activeProjects: active.length,
        overallProgressPercent: overall,
        inProgressTasks: projects.reduce((sum, project) => sum + project.taskCounts.inProgress, 0),
        completedToday,
        completedThisWeek,
        openTickets: openTickets.length,
        ticketsNeedingYou: openTickets.filter((ticket) => ticket.needsYourAction).length,
        pendingApprovals: pendingApprovals.length,
        openChangeRequests: changeRequests.total,
        supportHoursRemainingMinutes: hourContracts.length
          ? hourContracts.reduce(
              (sum, contract) => sum + (contract.hours?.remainingMinutes ?? 0),
              0,
            )
          : null,
      },
      contracts: activeContracts,
      pendingApprovals,
      projects,
      recentUpdates: updates.map(toPortalClientUpdate),
      openTickets: openTickets.slice(0, 10),
      recentFiles: files
        .filter(
          (file) =>
            file.project?.clientOrganizationId === actor.organizationId ||
            file.task?.project.clientOrganizationId === actor.organizationId ||
            file.ticket?.clientOrganizationId === actor.organizationId,
        )
        .slice(-10)
        .reverse()
        .map(toFileSummary),
    };
  }

  async listProjects(actor: AuthenticatedUser): Promise<PortalProjectSummary[]> {
    const providerId = await this.provider(actor);
    const rows = await this.projects.list({
      organizationId: providerId,
      clientOrganizationId: actor.organizationId,
    });
    const counts = await this.projects.countsByProject(
      providerId,
      rows.map((row) => row.id),
    );
    const lastUpdates = await this.prisma.clientUpdate.groupBy({
      by: ['projectId'],
      where: { clientOrganizationId: actor.organizationId, status: CLIENT_UPDATE_STATUS.PUBLISHED },
      _max: { publishedAt: true },
    });
    const lastByProject = new Map(lastUpdates.map((row) => [row.projectId, row._max.publishedAt]));
    return rows.map((row) =>
      toPortalProject(row, counts.get(row.id), lastByProject.get(row.id) ?? null),
    );
  }

  async getProject(actor: AuthenticatedUser, id: string): Promise<PortalProjectDetail> {
    const providerId = await this.provider(actor);
    const row = await this.projects.findById(providerId, id);
    if (!row || row.clientOrganizationId !== actor.organizationId) {
      throw new NotFoundException('Project not found');
    }
    const [counts, tasks, updates, files] = await Promise.all([
      this.projects.countsByProject(providerId, [row.id]),
      this.tasks.list({
        organizationId: providerId,
        projectId: row.id,
        clientVisible: true,
        status: [
          TASK_STATUS.ASSIGNED,
          TASK_STATUS.IN_PROGRESS,
          TASK_STATUS.IN_REVIEW,
          TASK_STATUS.RETURNED_TO_DEV,
          TASK_STATUS.BLOCKED,
          TASK_STATUS.REOPENED,
          TASK_STATUS.COMPLETED,
        ],
        limit: 100,
      }),
      this.updates.list({
        organizationId: providerId,
        clientOrganizationId: actor.organizationId,
        projectId: row.id,
        status: [CLIENT_UPDATE_STATUS.PUBLISHED],
        limit: 50,
      }),
      this.files.list(providerId, { projectId: row.id }, { visibility: VISIBILITY.CLIENT }),
    ]);
    const milestones = await this.milestones.listForPortal(actor, providerId, row.id);
    const lastUpdate = updates[0]?.publishedAt ?? null;
    return {
      ...toPortalProject(row, counts.get(row.id), lastUpdate),
      tasks: tasks.items.map(toPortalTask),
      milestones,
      updates: updates.map(toPortalClientUpdate),
      files: files.map(toFileSummary),
    };
  }

  async listUpdates(
    actor: AuthenticatedUser,
    from?: string,
    to?: string,
  ): Promise<PortalClientUpdate[]> {
    const providerId = await this.provider(actor);
    const rows = await this.updates.list({
      organizationId: providerId,
      clientOrganizationId: actor.organizationId,
      status: [CLIENT_UPDATE_STATUS.PUBLISHED],
      workDateFrom: from ? new Date(from) : undefined,
      workDateTo: to ? new Date(to) : undefined,
    });
    return boundedList('GET /portal/updates', rows.map(toPortalClientUpdate));
  }

  async listFiles(actor: AuthenticatedUser): Promise<FileSummary[]> {
    const providerId = await this.provider(actor);
    const rows = await this.files.list(providerId, {}, { visibility: VISIBILITY.CLIENT });
    return rows
      .filter(
        (file) =>
          file.project?.clientOrganizationId === actor.organizationId ||
          file.task?.project.clientOrganizationId === actor.organizationId ||
          file.ticket?.clientOrganizationId === actor.organizationId,
      )
      .map(toFileSummary);
  }

  private countPublished(
    providerId: string,
    clientOrganizationId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.clientUpdate.count({
      where: {
        organizationId: providerId,
        clientOrganizationId,
        status: CLIENT_UPDATE_STATUS.PUBLISHED,
        publishedAt: { gte: from, lt: to },
      },
    });
  }

  private async provider(actor: AuthenticatedUser): Promise<string> {
    this.assertClient(actor);
    return this.tickets.providerId(actor);
  }

  private assertClient(actor: AuthenticatedUser): void {
    if (!isClientUser(actor)) {
      throw new ForbiddenException('The portal is for client organizations');
    }
  }
}

export const PORTAL_OPEN_TICKET_STATUSES = [...OPEN_TICKET_STATUSES, TICKET_STATUS.RESOLVED];
