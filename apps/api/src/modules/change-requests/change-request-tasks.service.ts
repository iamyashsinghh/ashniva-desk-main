import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CHANGE_REQUEST_ACTION,
  MILESTONE_STATUS,
  TASK_STATUS,
  type AuthenticatedUser,
  type ChangeRequestDetail,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { MilestoneProgressService } from '../milestones/milestone-progress.service';
import { MilestonesRepository } from '../milestones/milestones.repository';
import { TasksRepository } from '../tasks/tasks.repository';
import { assertChangeRequestAction } from './change-request-workflow';
import { changeRequestNumber } from './change-requests.mapper';
import { ChangeRequestsRepository } from './change-requests.repository';
import { ChangeRequestsService } from './change-requests.service';
import type { GenerateTasksDto } from './dto/change-request.dto';

/**
 * An approved change request becomes work: linked tasks (traceable back through
 * task.changeRequestId), optionally grouped under a new or existing milestone that also links
 * back to the request.
 */
@Injectable()
export class ChangeRequestTasksService {
  constructor(
    private readonly changeRequests: ChangeRequestsRepository,
    private readonly service: ChangeRequestsService,
    private readonly tasks: TasksRepository,
    private readonly milestones: MilestonesRepository,
    private readonly progress: MilestoneProgressService,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async generate(
    actor: AuthenticatedUser,
    id: string,
    dto: GenerateTasksDto,
  ): Promise<ChangeRequestDetail> {
    const cr = await this.service.require(actor, id);
    assertChangeRequestAction(cr, actor, CHANGE_REQUEST_ACTION.GENERATE_TASKS);
    const projectId = dto.projectId ?? cr.projectId;
    if (!projectId) {
      throw new BadRequestException('Choose the project the work belongs to');
    }
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        organizationId: cr.organizationId,
        clientOrganizationId: cr.clientOrganizationId,
        deletedAt: null,
      },
    });
    if (!project) {
      throw new NotFoundException('Project not found for this client');
    }
    await this.assertAssignees(
      cr.organizationId,
      dto.tasks.map((task) => task.assignedToId),
    );
    const milestoneId = await this.resolveMilestone(actor, cr.id, project.id, dto);
    const number = changeRequestNumber(cr);
    const created: string[] = [];
    for (const input of dto.tasks) {
      const task = await this.tasks.create(
        cr.organizationId,
        {
          projectId: project.id,
          title: input.title.trim(),
          description:
            input.description?.trim() || `${cr.description}\n\n(From change request ${number})`,
          status: input.assignedToId ? TASK_STATUS.ASSIGNED : TASK_STATUS.DRAFT,
          assignedToId: input.assignedToId ?? null,
          createdById: actor.userId,
          changeRequestId: cr.id,
          milestoneId,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          clientVisible: true,
        },
        `Created from change request ${number}`,
      );
      created.push(`${task.project.code}-${task.number}`);
    }
    if (milestoneId) {
      await this.progress.recompute(milestoneId);
    }
    if (!cr.projectId) {
      await this.changeRequests.update(cr.id, { projectId: project.id });
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.CHANGE_REQUEST_TASKS_GENERATED,
      entityType: AUDIT_ENTITY_TYPE.CHANGE_REQUEST,
      entityId: cr.id,
      organizationId: cr.organizationId,
      after: { number, tasks: created, milestoneId },
    });
    return this.service.get(actor, cr.id);
  }

  private async resolveMilestone(
    actor: AuthenticatedUser,
    changeRequestId: string,
    projectId: string,
    dto: GenerateTasksDto,
  ): Promise<string | null> {
    if (dto.milestoneId && dto.milestone) {
      throw new BadRequestException('Pick an existing milestone or describe a new one, not both');
    }
    if (dto.milestoneId) {
      const existing = await this.prisma.milestone.findFirst({
        where: { id: dto.milestoneId, projectId, deletedAt: null },
      });
      if (!existing) {
        throw new NotFoundException('Milestone not found in that project');
      }
      if (!existing.changeRequestId) {
        await this.milestones.update(existing.id, { changeRequestId });
      }
      return existing.id;
    }
    if (dto.milestone) {
      const created = await this.milestones.create({
        organizationId: actor.organizationId,
        projectId,
        changeRequestId,
        name: dto.milestone.name.trim(),
        dueDate: dto.milestone.dueDate ? new Date(dto.milestone.dueDate) : null,
        clientVisible: dto.milestone.clientVisible ?? true,
        status: MILESTONE_STATUS.PLANNED,
        createdById: actor.userId,
        history: {
          create: { kind: 'CREATED', toValue: MILESTONE_STATUS.PLANNED, changedById: actor.userId },
        },
      });
      return created.id;
    }
    return null;
  }

  private async assertAssignees(
    organizationId: string,
    userIds: Array<string | undefined>,
  ): Promise<void> {
    const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
    if (ids.length === 0) {
      return;
    }
    const count = await this.prisma.organizationMembership.count({
      where: { organizationId, userId: { in: ids }, deletedAt: null },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Every assignee must be internal staff');
    }
  }
}
