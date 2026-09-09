import {
  OPERATIONS_PROJECT_STATUSES,
  TICKET_STATUS,
  type OperationsProjectRow,
  type ProjectMemberRole,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';
import type {
  ProjectCounts,
  ProjectRow,
  ProjectsRepository,
} from '../../projects/projects.repository';
import { toProjectSummary } from '../../projects/projects.mapper';

function sum(counts: ProjectCounts | undefined, statuses: readonly string[]): number {
  if (!counts) {
    return 0;
  }
  return statuses.reduce((total, status) => total + (counts.byStatus[status] ?? 0), 0);
}

/**
 * The project grid: one row per project in scope, with what is stuck on it.
 *
 * Four queries for any number of projects — `countsByProject` is three grouped queries and the
 * escalated tickets are a fourth. Nothing here is counted per project in a loop, because the row
 * count is the number of projects a manager has and that grows.
 */
export async function buildOperationsProjects(
  deps: { prisma: PrismaService; projects: ProjectsRepository },
  organizationId: string,
  today: Date,
  rows: ProjectRow[],
): Promise<OperationsProjectRow[]> {
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return [];
  }
  const [counts, escalated] = await Promise.all([
    deps.projects.countsByProject(organizationId, ids),
    deps.prisma.ticket.groupBy({
      by: ['projectId'],
      where: {
        organizationId,
        deletedAt: null,
        projectId: { in: ids },
        status: TICKET_STATUS.ESCALATED,
      },
      _count: { _all: true },
    }),
  ]);
  const escalatedByProject = new Map(
    escalated
      .filter((row): row is typeof row & { projectId: string } => row.projectId !== null)
      .map((row) => [row.projectId, row._count._all]),
  );
  return rows.map((row) => {
    const projectCounts = counts.get(row.id);
    const summary = toProjectSummary(row, projectCounts, today);
    return {
      project: { id: row.id, code: row.code, name: row.name },
      clientOrganization: row.clientOrganization,
      status: summary.status,
      health: summary.health,
      progressPercent: summary.progressPercent,
      manager: row.manager,
      lead: row.lead,
      team: row.members.map((member) => ({
        ...member.user,
        role: member.role as ProjectMemberRole,
        responsibilities: member.responsibilities,
      })),
      blocked: summary.taskCounts.blocked,
      overdue: summary.taskCounts.overdue,
      pendingQa: sum(projectCounts, OPERATIONS_PROJECT_STATUSES.pendingQa),
      pendingUat: sum(projectCounts, OPERATIONS_PROJECT_STATUSES.pendingUat),
      pendingRelease: sum(projectCounts, OPERATIONS_PROJECT_STATUSES.pendingRelease),
      openTickets: summary.openTicketCount,
      escalatedTickets: escalatedByProject.get(row.id) ?? 0,
    };
  });
}
