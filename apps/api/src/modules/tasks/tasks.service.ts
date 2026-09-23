import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  NOTIFICATION_TYPE,
  PERMISSIONS,
  PRIORITY,
  PROJECT_TYPE,
  ROLE_KEYS,
  TASK_ACTION,
  TASK_CATEGORY_KIND,
  TASK_STATUS,
  VISIBILITY,
  isManagerRole,
  type AuthenticatedUser,
  type CommentSummary,
  type PaginatedResponse,
  type TaskCategoryKind,
  type TaskCategoryRef,
  type TaskDetail,
  type TaskSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { MilestoneProgressService } from '../milestones/milestone-progress.service';
import { ProjectsRepository } from '../projects/projects.repository';
import { TaskEventsService } from './task-events.service';
import { CommentsRepository } from './comments.repository';
import type {
  CreateCommentDto,
  CreateTaskDto,
  ListTasksQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { buildTaskListFilter } from './task-list-filter';
import { TaskVisibilityService } from './task-visibility.service';
import { assertAction, listActions } from './task-workflow';
import { toComment, toTaskDetail, toTaskSummary, todayUtc } from './tasks.mapper';
import { TasksRepository, type TaskSummaryRow } from './tasks.repository';

/** Reads, creation and edits. Status changes live in TaskTransitionsService. */
@Injectable()
export class TasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly comments: CommentsRepository,
    private readonly projects: ProjectsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly milestones: MilestoneProgressService,
    private readonly events: TaskEventsService,
    private readonly visibility: TaskVisibilityService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListTasksQueryDto,
  ): Promise<PaginatedResponse<TaskSummary>> {
    this.assertInternal(actor);
    // Refused rather than quietly narrowed: `?assignedToId=` used to take any user id at all, and
    // the views that honour it (upcoming, today, overdue, done) handed back that person's work.
    await this.visibility.assertMayFilterBy(actor, query.assignedToId);
    const filter = await buildTaskListFilter(
      this.prisma,
      actor,
      query,
      await this.visibility.taskWhere(actor),
    );
    const page = await this.tasks.list(filter);
    const today = todayUtc();
    return {
      items: page.items.map((row) => toTaskSummary(row, today)),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async categories(actor: AuthenticatedUser): Promise<TaskCategoryRef[]> {
    this.assertInternal(actor);
    const rows = await this.prisma.taskCategory.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind as TaskCategoryKind }));
  }

  async get(actor: AuthenticatedUser, id: string): Promise<TaskDetail> {
    this.assertInternal(actor);
    const row = await this.tasks.findDetail(
      actor.organizationId,
      id,
      await this.visibility.taskWhere(actor),
    );
    // 404, not 403: a task outside the caller's scope must not be distinguishable from one that
    // does not exist, or the id becomes a probe for who is working on what.
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return toTaskDetail(row, listActions(row, actor), {
      includeInternalComments: actor.permissions.includes(PERMISSIONS.COMMENT_INTERNAL),
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateTaskDto): Promise<TaskDetail> {
    this.assertInternal(actor);
    const isInternTask = Boolean(dto.isInternTask);
    if (isInternTask && !isManagerRole(actor.roleKey)) {
      throw new ForbiddenException(
        'Only a director, project manager or team lead can assign intern work',
      );
    }
    if (isInternTask && !dto.assignedToId) {
      throw new BadRequestException('Pick an intern to assign this work to');
    }
    if (!dto.projectId && !isInternTask) {
      throw new BadRequestException('Choose a project');
    }
    const projectId =
      dto.projectId ?? (await this.ensureInternWorkProject(actor)).id;
    const project = await this.projects.findById(actor.organizationId, projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (
      dto.assignedToId &&
      !actor.permissions.includes(PERMISSIONS.TASK_ASSIGN) &&
      dto.assignedToId !== actor.userId
    ) {
      throw new ForbiddenException('Your role can only assign tasks to yourself');
    }
    await this.assertPeople(actor, [dto.assignedToId, dto.reviewerId, dto.testerId]);
    if (isInternTask && dto.assignedToId) {
      await this.assertInternAssignee(actor, dto.assignedToId);
    }
    let categoryId = dto.categoryId ?? null;
    if (isInternTask && !categoryId) {
      categoryId = await this.internCategoryId(actor.organizationId);
    }
    if (categoryId) {
      const category = await this.prisma.taskCategory.findFirst({
        where: { id: categoryId, organizationId: actor.organizationId, isActive: true },
      });
      if (!category) {
        throw new BadRequestException('Unknown task category');
      }
    }
    if (dto.ticketId) {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id: dto.ticketId, organizationId: actor.organizationId, deletedAt: null },
      });
      if (!ticket) {
        throw new NotFoundException('Ticket not found');
      }
    }
    await this.assertMilestone(actor, dto.milestoneId ?? undefined, project.id);

    const status = dto.assignedToId && !dto.saveAsDraft ? TASK_STATUS.ASSIGNED : TASK_STATUS.DRAFT;
    const row = await this.tasks.create(actor.organizationId, {
      projectId: project.id,
      title: dto.title,
      description: dto.description ?? null,
      status,
      priority: dto.priority ?? PRIORITY.MEDIUM,
      categoryId,
      module: dto.module ?? (isInternTask ? 'Intern work' : null),
      isInternTask,
      assignedToId: dto.assignedToId ?? null,
      createdById: actor.userId,
      reviewerId: isInternTask ? null : (dto.reviewerId ?? null),
      testerId: isInternTask ? null : (dto.testerId ?? null),
      ticketId: isInternTask ? null : (dto.ticketId ?? null),
      milestoneId: isInternTask ? null : (dto.milestoneId ?? null),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      scheduledStartAt: dto.scheduledStartAt ? new Date(dto.scheduledStartAt) : null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      workAreas: dto.workAreas ?? [],
      estimateMinutes: dto.estimateMinutes ?? null,
      acceptanceCriteria: dto.acceptanceCriteria ?? null,
      clientVisible: isInternTask ? false : (dto.clientVisible ?? false),
    });
    if (row.milestoneId) {
      await this.milestones.recompute(row.milestoneId);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.TASK_CREATED,
      entityType: AUDIT_ENTITY_TYPE.TASK,
      entityId: row.id,
      after: {
        key: `${row.project.code}-${row.number}`,
        title: row.title,
        status,
        assignedToId: row.assignedToId,
        isInternTask,
      },
    });
    if (status === TASK_STATUS.ASSIGNED) {
      await this.events.notify(actor, row, NOTIFICATION_TYPE.TASK_ASSIGNED, [row.assignedToId]);
    }
    return this.get(actor, row.id);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTaskDto): Promise<TaskDetail> {
    const before = await this.requireSummary(actor, id);
    assertAction(before, actor, TASK_ACTION.EDIT);
    await this.assertPeople(actor, [dto.reviewerId ?? undefined, dto.testerId ?? undefined]);
    await this.assertMilestone(actor, dto.milestoneId ?? undefined, before.projectId);
    const { dueDate, scheduledStartAt, dueAt, ...rest } = dto;
    const row = await this.tasks.update(before.organizationId, id, {
      ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(scheduledStartAt !== undefined
        ? { scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null }
        : {}),
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
    });
    for (const milestoneId of new Set([before.milestoneId, row.milestoneId])) {
      if (milestoneId) {
        await this.milestones.recompute(milestoneId);
      }
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.TASK_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.TASK,
      entityId: id,
      before: { title: before.title, priority: before.priority, dueDate: before.dueDate },
      after: { title: row.title, priority: row.priority, dueDate: row.dueDate },
    });
    return this.get(actor, id);
  }

  async addComment(
    actor: AuthenticatedUser,
    id: string,
    dto: CreateCommentDto,
  ): Promise<CommentSummary> {
    const task = await this.requireSummary(actor, id);
    const visibility = dto.visibility ?? VISIBILITY.INTERNAL;
    if (
      visibility === VISIBILITY.INTERNAL &&
      !actor.permissions.includes(PERMISSIONS.COMMENT_INTERNAL)
    ) {
      throw new ForbiddenException('Your role cannot write internal comments');
    }
    if (visibility === VISIBILITY.CLIENT && !task.project.clientOrganizationId) {
      throw new BadRequestException('This project has no client to show the comment to');
    }
    const row = await this.comments.create({
      organizationId: actor.organizationId,
      taskId: id,
      authorId: actor.userId,
      body: dto.body,
      visibility,
    });
    return toComment(row);
  }

  /**
   * The scoped read every write goes through.
   *
   * This is the write side of the same rule, and it is why `task-workflow.ts` can decide "may this
   * person manage this task" from the permission alone: `task:assign` used to be the whole answer,
   * so somebody who could not legitimately list a task could still `PATCH` it by id. Now they
   * cannot load it. Every mutation — edit, assign, start, block, unblock, submit, review, reopen,
   * cancel, log work, comment — begins here.
   */
  async requireSummary(actor: AuthenticatedUser, id: string): Promise<TaskSummaryRow> {
    this.assertInternal(actor);
    const row = await this.tasks.findSummary(
      actor.organizationId,
      id,
      await this.visibility.taskWhere(actor),
    );
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return row;
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Clients see their work through the portal');
    }
  }

  /** People referenced on a task must belong to the organization. */
  private async assertPeople(
    actor: AuthenticatedUser,
    userIds: Array<string | undefined>,
  ): Promise<void> {
    const ids = [...new Set(userIds.filter((value): value is string => Boolean(value)))];
    if (ids.length === 0) {
      return;
    }
    const count = await this.prisma.organizationMembership.count({
      where: { organizationId: actor.organizationId, userId: { in: ids }, deletedAt: null },
    });
    if (count !== ids.length) {
      throw new BadRequestException('One of the people is not a member of your organization');
    }
  }

  /** A milestone can only be linked from tasks of its own project. */
  private async assertMilestone(
    actor: AuthenticatedUser,
    milestoneId: string | undefined,
    projectId: string,
  ): Promise<void> {
    if (!milestoneId) {
      return;
    }
    const milestone = await this.prisma.milestone.findFirst({
      where: { id: milestoneId, organizationId: actor.organizationId, projectId, deletedAt: null },
    });
    if (!milestone) {
      throw new BadRequestException('The milestone must belong to the task’s project');
    }
  }

  private async assertInternAssignee(actor: AuthenticatedUser, userId: string): Promise<void> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { organizationId: actor.organizationId, userId, deletedAt: null },
      select: { role: { select: { key: true } } },
    });
    if (membership?.role.key !== ROLE_KEYS.INTERN) {
      throw new BadRequestException('Intern work can only be assigned to an intern');
    }
  }

  /**
   * Bucket for intern assignments that are not tied to a client project.
   * Created once per organization the first time someone assigns without picking a project.
   */
  private async ensureInternWorkProject(actor: AuthenticatedUser) {
    const existing = await this.projects.findByCode(actor.organizationId, 'INT');
    if (existing) {
      return existing;
    }
    return this.projects.create(actor.organizationId, actor.userId, {
      code: 'INT',
      name: 'Intern work',
      description: 'Learning assignments that are not tied to a client project.',
      type: PROJECT_TYPE.INTERNAL_WORK,
      status: 'ACTIVE',
      managerUserId: actor.userId,
    });
  }

  private async internCategoryId(organizationId: string): Promise<string | null> {
    const category = await this.prisma.taskCategory.findFirst({
      where: {
        organizationId,
        isActive: true,
        OR: [{ name: 'Intern work' }, { kind: TASK_CATEGORY_KIND.OTHER, name: { contains: 'Intern' } }],
      },
      orderBy: { sortOrder: 'asc' },
    });
    return category?.id ?? null;
  }
}
