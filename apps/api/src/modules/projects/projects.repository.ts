import { Injectable } from '@nestjs/common';
import { OPEN_TASK_STATUSES, OPEN_TICKET_STATUSES } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, ProjectStatus } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

const projectInclude = {
  clientOrganization: { select: { id: true, name: true, slug: true } },
  manager: userRef,
  lead: userRef,
  team: { select: { id: true, name: true } },
  members: { include: { user: userRef }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ProjectInclude;

export type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

/** Raw numbers per project the mapper turns into progress and health. */
export interface ProjectCounts {
  byStatus: Partial<Record<string, number>>;
  overdue: number;
  openTickets: number;
}

export interface ProjectFilter {
  organizationId: string;
  clientOrganizationId?: string;
  status?: ProjectStatus;
  search?: string;
  /** Only projects the user is a member, manager or lead of. */
  memberUserId?: string;
}

export interface ProjectData {
  code: string;
  name: string;
  description?: string | null;
  type: Prisma.ProjectCreateInput['type'];
  status?: ProjectStatus;
  clientOrganizationId?: string | null;
  managerUserId?: string | null;
  leadUserId?: string | null;
  teamId?: string | null;
  startDate?: Date | null;
  targetDate?: Date | null;
  requiresClientUat?: boolean;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(filter: ProjectFilter): Promise<ProjectRow[]> {
    const search = filter.search?.trim();
    return this.prisma.project.findMany({
      where: {
        organizationId: filter.organizationId,
        deletedAt: null,
        ...(filter.clientOrganizationId
          ? { clientOrganizationId: filter.clientOrganizationId }
          : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.memberUserId
          ? {
              OR: [
                { managerUserId: filter.memberUserId },
                { leadUserId: filter.memberUserId },
                { members: { some: { userId: filter.memberUserId } } },
              ],
            }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: projectInclude,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
  }

  findById(organizationId: string, id: string): Promise<ProjectRow | null> {
    return this.prisma.project.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: projectInclude,
    });
  }

  findByCode(organizationId: string, code: string) {
    return this.prisma.project.findFirst({ where: { organizationId, code, deletedAt: null } });
  }

  create(organizationId: string, createdById: string, data: ProjectData): Promise<ProjectRow> {
    return this.prisma.project.create({
      data: { ...data, organizationId, createdById },
      include: projectInclude,
    });
  }

  update(id: string, data: Partial<ProjectData>): Promise<ProjectRow> {
    return this.prisma.project.update({ where: { id }, data, include: projectInclude });
  }

  async setMembers(
    organizationId: string,
    projectId: string,
    members: Array<{
      userId: string;
      role: Prisma.ProjectMemberCreateManyInput['role'];
      responsibilities?: string[];
    }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId } });
      if (members.length === 0) {
        return;
      }
      // Internal staff or the client's own people only; anyone else is silently dropped.
      const project = await tx.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { clientOrganizationId: true },
      });
      const allowedOrganizations = [organizationId, project.clientOrganizationId].filter(
        (value): value is string => value !== null,
      );
      const valid = await tx.organizationMembership.findMany({
        where: {
          organizationId: { in: allowedOrganizations },
          userId: { in: members.map((member) => member.userId) },
          deletedAt: null,
        },
        select: { userId: true },
      });
      const validIds = new Set(valid.map((row) => row.userId));
      await tx.projectMember.createMany({
        data: members
          .filter((member) => validIds.has(member.userId))
          .map((member) => ({
            projectId,
            userId: member.userId,
            role: member.role,
            responsibilities: member.responsibilities ?? [],
          })),
        skipDuplicates: true,
      });
    });
  }

  /** Task and ticket counts for many projects in three grouped queries. */
  async countsByProject(
    organizationId: string,
    projectIds: string[],
  ): Promise<Map<string, ProjectCounts>> {
    const counts = new Map<string, ProjectCounts>();
    if (projectIds.length === 0) {
      return counts;
    }
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [byStatus, overdue, tickets] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['projectId', 'status'],
        where: { organizationId, deletedAt: null, projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: {
          organizationId,
          deletedAt: null,
          projectId: { in: projectIds },
          dueDate: { lt: today },
          status: { in: [...OPEN_TASK_STATUSES] },
        },
        _count: { _all: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['projectId'],
        where: {
          organizationId,
          deletedAt: null,
          projectId: { in: projectIds },
          status: { in: [...OPEN_TICKET_STATUSES] },
        },
        _count: { _all: true },
      }),
    ]);
    const entry = (projectId: string): ProjectCounts => {
      let value = counts.get(projectId);
      if (!value) {
        value = { byStatus: {}, overdue: 0, openTickets: 0 };
        counts.set(projectId, value);
      }
      return value;
    };
    for (const row of byStatus) {
      entry(row.projectId).byStatus[row.status] = row._count._all;
    }
    for (const row of overdue) {
      entry(row.projectId).overdue = row._count._all;
    }
    for (const row of tickets) {
      if (row.projectId) {
        entry(row.projectId).openTickets = row._count._all;
      }
    }
    return counts;
  }
}
