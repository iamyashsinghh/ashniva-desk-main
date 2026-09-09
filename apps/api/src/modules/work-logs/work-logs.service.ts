import { ForbiddenException, Injectable } from '@nestjs/common';
import { PERMISSIONS, type AuthenticatedUser, type WorkLogSummary } from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { boundedList } from '../../common/dto/unpaginated-list';
import type { ListWorkLogsQueryDto } from './dto/work-log.dto';
import { WorkLogsRepository, type WorkLogRow } from './work-logs.repository';

export function toWorkLogSummary(row: WorkLogRow): WorkLogSummary {
  return {
    id: row.id,
    task: {
      id: row.task.id,
      key: `${row.task.project.code}-${row.task.number}`,
      title: row.task.title,
    },
    project: row.task.project,
    user: row.user,
    workDate: row.workDate.toISOString().slice(0, 10),
    minutes: row.minutes,
    summary: row.summary,
    proofUrl: row.proofUrl,
    gitRef: row.gitRef,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Who may read whose time: everyone their own (report:read-own), team leads their team
 * members (report:read-team), managers everyone (report:read-all).
 */
@Injectable()
export class WorkLogsService {
  constructor(
    private readonly workLogs: WorkLogsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListWorkLogsQueryDto): Promise<WorkLogSummary[]> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Work logs are internal');
    }
    const userIds = await this.visibleUserIds(actor, query.userId);
    const rows = await this.workLogs.list({
      organizationId: actor.organizationId,
      userIds,
      taskId: query.taskId,
      projectId: query.projectId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return boundedList('GET /work-logs', rows.map(toWorkLogSummary));
  }

  /** Resolves the people whose logs the actor may see, narrowed to `requested` if given. */
  async visibleUserIds(
    actor: AuthenticatedUser,
    requested?: string,
  ): Promise<string[] | undefined> {
    if (actor.permissions.includes(PERMISSIONS.REPORT_READ_ALL)) {
      return requested ? [requested] : undefined;
    }
    const allowed = new Set<string>([actor.userId]);
    if (actor.permissions.includes(PERMISSIONS.REPORT_READ_TEAM)) {
      const teams = await this.prisma.team.findMany({
        where: {
          organizationId: actor.organizationId,
          deletedAt: null,
          OR: [{ leadUserId: actor.userId }, { members: { some: { userId: actor.userId } } }],
        },
        select: { members: { select: { userId: true } } },
      });
      for (const team of teams) {
        for (const member of team.members) {
          allowed.add(member.userId);
        }
      }
    }
    if (requested && !allowed.has(requested)) {
      throw new ForbiddenException('You cannot see this person’s work logs');
    }
    return requested ? [requested] : [...allowed];
  }
}
