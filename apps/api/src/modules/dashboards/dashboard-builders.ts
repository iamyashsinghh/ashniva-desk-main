import {
  CLIENT_UPDATE_STATUS,
  PROJECT_HEALTH,
  PROJECT_STATUS,
  TASK_STATUS,
  type DeveloperDashboard,
  type ManagementDashboard,
  type SeniorDashboard,
  type StatusCount,
  type TaskStatus,
  type TesterDashboard,
} from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import { toClientUpdateSummary } from '../client-updates/client-updates.service';
import type { ClientUpdatesRepository } from '../client-updates/client-updates.repository';
import { toProjectSummary } from '../projects/projects.mapper';
import type { ProjectsRepository } from '../projects/projects.repository';
import { teamPeerIds } from '../tasks/task-list-filter';
import { OPEN_TASKS, OPEN_TICKETS, type DashboardQueries } from './dashboard-queries';

export interface BuilderDeps {
  prisma: PrismaService;
  projects: ProjectsRepository;
  updates: ClientUpdatesRepository;
}

/** Super Admin and Project Manager: the whole organization at a glance. */
export async function buildManagementDashboard(
  q: DashboardQueries,
  deps: BuilderDeps,
): Promise<ManagementDashboard> {
  const { organizationId } = q.ctx;
  const projectRows = await deps.projects.list({ organizationId, status: PROJECT_STATUS.ACTIVE });
  const counts = await deps.projects.countsByProject(
    organizationId,
    projectRows.map((row) => row.id),
  );
  const projects = projectRows.map((row) => toProjectSummary(row, counts.get(row.id), q.ctx.today));
  const [
    completedToday,
    overdueTasks,
    criticalTickets,
    pendingReviews,
    updatesWaiting,
    openTickets,
    slaAtRisk,
    slaBreached,
    contractsExpiring,
    approvalsWaitingClient,
    openChangeRequests,
    workload,
    overdueList,
    criticalList,
    updatesList,
  ] = await Promise.all([
    q.countTasks(q.completedToday()),
    q.countTasks(q.overdue()),
    q.countTickets(q.criticalOpenTickets()),
    q.countTasks({ status: TASK_STATUS.IN_REVIEW }),
    deps.updates.countPending(organizationId),
    q.countTickets({ status: { in: OPEN_TICKETS } }),
    q.countTickets(q.slaTickets('at-risk')),
    q.countTickets(q.slaTickets('breached')),
    q.countExpiringContracts(),
    q.countApprovalsWaitingClient(),
    q.countOpenChangeRequests(),
    q.workload(),
    q.tasks(q.overdue(), 10),
    q.tickets(q.criticalOpenTickets(), 10),
    deps.updates.list({ organizationId, status: [CLIENT_UPDATE_STATUS.PENDING], limit: 10 }),
  ]);
  return {
    kind: 'management',
    kpis: {
      activeProjects: projects.length,
      projectsAtRisk: projects.filter((project) => project.health !== PROJECT_HEALTH.ON_TRACK)
        .length,
      completedToday,
      overdueTasks,
      criticalTickets,
      pendingReviews,
      updatesWaitingToPublish: updatesWaiting,
      openTickets,
      slaAtRisk,
      slaBreached,
      contractsExpiring,
      approvalsWaitingClient,
      openChangeRequests,
    },
    projects,
    workload,
    overdueTasks: overdueList,
    criticalTickets: criticalList,
    updatesWaiting: updatesList.map(toClientUpdateSummary),
  };
}

/** Team Lead: management of the team's work, and separately their own development tasks. */
export async function buildSeniorDashboard(
  q: DashboardQueries,
  deps: BuilderDeps,
  showDevelopmentSection: boolean,
): Promise<SeniorDashboard> {
  const { userId, organizationId } = q.ctx;
  // The workload card lists the people the lead oversees, so it leaves the lead out.
  const teamIds = await q.teamPeersExcludingSelf(userId);
  // Every "Management" card links to the team task list, so they all count the same people that
  // GET /tasks?view=team selects — the lead's teams, including the lead.
  const teamScope = {
    assignedToId: { in: await teamPeerIds(deps.prisma, organizationId, userId) },
  };
  const [
    assignedByMe,
    progressRows,
    completedToday,
    underReview,
    delayed,
    blockers,
    reviewQueue,
    updatesWaiting,
    workload,
    todayTasks,
    inProgress,
    overdue,
    minutes,
  ] = await Promise.all([
    q.countTasks({ createdById: userId, status: { in: OPEN_TASKS } }),
    deps.prisma.task.groupBy({
      by: ['status'],
      where: q.taskWhere({ ...teamScope, status: { in: OPEN_TASKS } }),
      _count: { _all: true },
    }),
    q.countTasks(q.completedToday(teamScope)),
    q.countTasks({ ...teamScope, status: TASK_STATUS.IN_REVIEW }),
    q.countTasks(q.overdue(teamScope)),
    q.tasks({ ...teamScope, status: TASK_STATUS.BLOCKED }, 10),
    q.tasks(
      { OR: [{ reviewerId: userId }, { testerId: userId }], status: TASK_STATUS.IN_REVIEW },
      10,
    ),
    deps.updates.countPending(organizationId),
    q.workload(teamIds),
    q.tasks(
      {
        assignedToId: userId,
        status: { in: OPEN_TASKS },
        OR: [{ dueDate: { lte: q.ctx.today } }, { status: TASK_STATUS.IN_PROGRESS }],
      },
      10,
    ),
    q.countTasks({ assignedToId: userId, status: TASK_STATUS.IN_PROGRESS }),
    q.countTasks(q.overdue({ assignedToId: userId })),
    q.minutesToday([userId]),
  ]);
  const teamProgress: StatusCount[] = progressRows.map((row) => ({
    status: row.status as TaskStatus,
    count: row._count._all,
  }));
  return {
    kind: 'senior',
    management: {
      assignedByMe,
      teamProgress,
      completedToday,
      underReview,
      delayed,
      blockers,
      reviewQueue,
      updatesWaitingToPublish: updatesWaiting,
      workload,
    },
    own: {
      enabled: showDevelopmentSection,
      todayTasks: showDevelopmentSection ? todayTasks : [],
      inProgress,
      overdue,
      minutesToday: minutes.get(userId) ?? 0,
    },
  };
}

export async function buildDeveloperDashboard(q: DashboardQueries): Promise<DeveloperDashboard> {
  const { userId } = q.ctx;
  const mine = { assignedToId: userId };
  const dueToday = { ...mine, dueDate: q.ctx.today, status: { in: OPEN_TASKS } };
  const inProgress = { ...mine, status: TASK_STATUS.IN_PROGRESS };
  const blocked = { ...mine, status: TASK_STATUS.BLOCKED };
  const [
    todayTasks,
    inProgressTasks,
    overdueTasks,
    blockedTasks,
    reviewResults,
    todayCount,
    inProgressCount,
    overdueCount,
    blockedCount,
    completedToday,
    minutes,
  ] = await Promise.all([
    q.tasks(dueToday, 20),
    q.tasks(inProgress, 20),
    q.tasks(q.overdue(mine), 20),
    q.tasks(blocked, 20),
    q.tasks({ ...mine, status: { in: [TASK_STATUS.RETURNED_TO_DEV, TASK_STATUS.REOPENED] } }, 20, [
      { updatedAt: 'desc' },
    ]),
    // Counted, not measured from the capped card lists: the KPI has to match the total the
    // task list reports once there are more than twenty of them.
    q.countTasks(dueToday),
    q.countTasks(inProgress),
    q.countTasks(q.overdue(mine)),
    q.countTasks(blocked),
    q.countTasks(q.completedToday(mine)),
    q.minutesToday([userId]),
  ]);
  return {
    kind: 'developer',
    kpis: {
      today: todayCount,
      inProgress: inProgressCount,
      overdue: overdueCount,
      blocked: blockedCount,
      completedToday,
      minutesToday: minutes.get(userId) ?? 0,
    },
    todayTasks,
    inProgressTasks,
    overdueTasks,
    blockedTasks,
    reviewResults,
  };
}

export async function buildTesterDashboard(
  q: DashboardQueries,
  deps: BuilderDeps,
): Promise<TesterDashboard> {
  const { userId, organizationId, today, tomorrow } = q.ctx;
  const [awaiting, reopened, approvedToday, rejectedToday, historyRows] = await Promise.all([
    q.tasks({ OR: [{ testerId: userId }, { testerId: null }], status: TASK_STATUS.IN_REVIEW }, 30),
    q.tasks({ status: TASK_STATUS.REOPENED }, 20),
    deps.prisma.taskStatusHistory.count({
      where: {
        changedById: userId,
        toStatus: TASK_STATUS.COMPLETED,
        createdAt: { gte: today, lt: tomorrow },
        task: { organizationId },
      },
    }),
    deps.prisma.taskStatusHistory.count({
      where: {
        changedById: userId,
        toStatus: TASK_STATUS.RETURNED_TO_DEV,
        createdAt: { gte: today, lt: tomorrow },
        task: { organizationId },
      },
    }),
    deps.prisma.taskStatusHistory.findMany({
      where: {
        changedById: userId,
        toStatus: { in: [TASK_STATUS.COMPLETED, TASK_STATUS.RETURNED_TO_DEV] },
        task: { organizationId },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { taskId: true },
    }),
  ]);
  const historyIds = [...new Set(historyRows.map((row) => row.taskId))];
  const history = historyIds.length
    ? await q.tasks({ id: { in: historyIds } }, 20, [{ updatedAt: 'desc' }])
    : [];
  return {
    kind: 'tester',
    kpis: {
      awaitingTesting: awaiting.length,
      approvedToday,
      rejectedToday,
      reopened: reopened.length,
    },
    awaitingTesting: awaiting,
    reopened,
    history,
  };
}
