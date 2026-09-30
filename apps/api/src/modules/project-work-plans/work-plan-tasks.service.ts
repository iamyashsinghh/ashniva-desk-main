import { Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  NOTIFICATION_TYPE,
  PRIORITY,
  PROJECT_MEMBER_ROLE,
  TASK_STATUS,
  WORK_PLAN_POINT_STATUS,
  effectiveWorkPlanAssigneeId,
  effectiveWorkPlanPriority,
  type AuthenticatedUser,
  type Priority,
  type TaskStatus,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { TaskEventsService } from '../tasks/task-events.service';
import { TasksRepository, type TaskSummaryRow } from '../tasks/tasks.repository';
import type { ProjectRow } from '../projects/projects.repository';
import type { WorkPlanRow } from './work-plan.mapper';

const EDITABLE = new Set<string>([TASK_STATUS.DRAFT, TASK_STATUS.ASSIGNED]);

/**
 * Where a topic's task stands, read from its steps. Error steps are left out: they follow their
 * parent step, which is the one that goes back to the developer and on to the tester again.
 *
 * - a step the tester sent back → Returned to developer
 * - a step being worked → In progress
 * - a step with the tester → Review / testing
 * - every step passed → Completed
 * - some passed, the rest not started → In progress
 *
 * Null while nothing has been started: the task then waits as Assigned (or Draft with nobody on it).
 */
export function taskStatusFromPoints(
  points: ReadonlyArray<{ status: string; isError: boolean }>,
): TaskStatus | null {
  const work = points.filter((point) => !point.isError);
  if (work.length === 0) {
    return null;
  }
  const has = (status: string) => work.some((point) => point.status === status);
  if (has(WORK_PLAN_POINT_STATUS.RETURNED)) {
    return TASK_STATUS.RETURNED_TO_DEV;
  }
  if (has(WORK_PLAN_POINT_STATUS.IN_PROGRESS)) {
    return TASK_STATUS.IN_PROGRESS;
  }
  if (has(WORK_PLAN_POINT_STATUS.AWAITING_TEST) || has(WORK_PLAN_POINT_STATUS.TESTING)) {
    return TASK_STATUS.IN_REVIEW;
  }
  if (work.every((point) => point.status === WORK_PLAN_POINT_STATUS.COMPLETED)) {
    return TASK_STATUS.COMPLETED;
  }
  if (has(WORK_PLAN_POINT_STATUS.COMPLETED)) {
    return TASK_STATUS.IN_PROGRESS;
  }
  return null;
}

/**
 * Turns every Summary topic into a real task — as soon as the topic exists, assigned or not — so
 * project managers, team leads and Super Admin see all the work on the task board, and keeps the
 * task's status in step with the Summary as the developer and tester move its steps.
 */
@Injectable()
export class WorkPlanTasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly events: TaskEventsService,
    private readonly prisma: PrismaService,
  ) {}

  async sync(actor: AuthenticatedUser, project: ProjectRow, row: WorkPlanRow): Promise<void> {
    const testerId = testersOn(project)[0]?.id ?? null;
    for (const phase of row.phases) {
      for (const title of phase.titles) {
        await this.syncTitle(actor, project.id, row, phase, title, testerId);
      }
    }
  }

  /**
   * The task a topic became, with the due date and reviewer an integration chose. Sync never
   * touches these two fields, so they survive later Summary saves.
   */
  async scheduleTitleTask(
    organizationId: string,
    titleId: string,
    schedule: { dueDate?: string | null; reviewerId?: string | null },
  ): Promise<TaskSummaryRow | null> {
    const task = await this.tasks.findByWorkPlanTitle(organizationId, titleId);
    if (!task) {
      return null;
    }
    const data = {
      ...(schedule.dueDate ? { dueDate: new Date(schedule.dueDate) } : {}),
      ...(schedule.reviewerId ? { reviewerId: schedule.reviewerId } : {}),
    };
    if (Object.keys(data).length === 0 || !EDITABLE.has(task.status)) {
      return task;
    }
    return this.tasks.update(organizationId, task.id, data);
  }

  /** After a step moves in the Summary: brings its topic's task to the matching status. */
  async follow(actor: AuthenticatedUser, titleId: string): Promise<void> {
    const task = await this.tasks.findByWorkPlanTitle(actor.organizationId, titleId);
    if (!task || task.deletedAt) {
      return;
    }
    const points = await this.prisma.projectWorkPlanPoint.findMany({
      where: { titleId },
      select: { status: true, isError: true },
    });
    await this.moveTo(actor, task, taskStatusFromPoints(points));
  }

  private async moveTo(
    actor: AuthenticatedUser,
    task: TaskSummaryRow,
    next: TaskStatus | null,
  ): Promise<void> {
    if (!next || next === task.status || task.status === TASK_STATUS.CANCELLED) {
      return;
    }
    const now = new Date();
    const data: Prisma.TaskUncheckedUpdateInput = {
      completedAt: next === TASK_STATUS.COMPLETED ? now : null,
    };
    if (next === TASK_STATUS.IN_PROGRESS && !task.startedAt) {
      data.startedAt = now;
    }
    if (next === TASK_STATUS.IN_REVIEW) {
      data.submittedAt = now;
    }
    const moved = await this.tasks.transition(
      actor.organizationId,
      task.id,
      task.status,
      next,
      actor.userId,
      'Follows the project summary',
      data,
    );
    await this.events.changed(actor, moved, AUDIT_ACTION.TASK_STATUS_CHANGED, {
      from: task.status,
      to: next,
      fromWorkPlan: true,
    });
  }

  private async syncTitle(
    actor: AuthenticatedUser,
    projectId: string,
    row: WorkPlanRow,
    phase: WorkPlanRow['phases'][number],
    title: WorkPlanRow['phases'][number]['titles'][number],
    testerId: string | null,
  ): Promise<void> {
    const assignedToId = effectiveWorkPlanAssigneeId(
      title.assignedToId,
      phase.assignedToId,
      row.assignedToId,
    );
    const priority = effectiveWorkPlanPriority(
      title.priority as Priority | null,
      phase.priority as Priority | null,
      row.priority as Priority | null,
    );
    const taskTitle = title.title.trim();
    const description = [
      `From project summary · ${phase.heading}.`,
      ...title.points.map((point) =>
        point.isError ? `• Error: ${point.body}` : `• ${point.body} (${point.estimateMinutes} min)`,
      ),
    ].join('\n');
    const estimateMinutes = title.points
      .filter((point) => !point.isError)
      .reduce((sum, point) => sum + point.estimateMinutes, 0);
    const existing = await this.tasks.findByWorkPlanTitle(actor.organizationId, title.id);
    const fromSummary = taskStatusFromPoints(title.points);
    const waiting = assignedToId ? TASK_STATUS.ASSIGNED : TASK_STATUS.DRAFT;
    const label = `From project summary · ${phase.heading} / ${taskTitle}`;

    // A topic with nobody on it yet still becomes a task (Draft), so the people running the
    // project see it on the board the moment it is added to the Summary.
    if (!existing) {
      const started = title.points
        .flatMap((point) => (point.startedAt ? [point.startedAt] : []))
        .sort((left, right) => left.getTime() - right.getTime());
      const created = await this.tasks.create(actor.organizationId, {
        projectId,
        title: taskTitle,
        description,
        status: fromSummary ?? waiting,
        startedAt: fromSummary ? (started[0] ?? new Date()) : null,
        completedAt: fromSummary === TASK_STATUS.COMPLETED ? new Date() : null,
        priority: priority ?? PRIORITY.MEDIUM,
        assignedToId,
        createdById: actor.userId,
        testerId,
        estimateMinutes,
        module: 'Work plan',
        workPlanTitleId: title.id,
      });
      await this.events.changed(actor, created, AUDIT_ACTION.TASK_CREATED, {
        assignedToId,
        testerId,
        fromWorkPlan: true,
      });
      if (assignedToId) {
        await this.notifyAssigned(actor, created, assignedToId, label);
      }
      return;
    }

    if (!EDITABLE.has(existing.status)) {
      // Work is under way: keep the wording in step and let the Summary drive the status.
      const updated = await this.tasks.update(actor.organizationId, existing.id, {
        title: taskTitle,
        description,
        estimateMinutes,
        deletedAt: null,
      });
      await this.moveTo(actor, updated, fromSummary);
      return;
    }

    const updated = await this.tasks.update(actor.organizationId, existing.id, {
      title: taskTitle,
      description,
      priority,
      assignedToId,
      testerId,
      estimateMinutes,
      status: waiting,
      deletedAt: null,
      module: existing.module ?? 'Work plan',
    });
    // Notify whenever this title's effective assignee is (re)set to someone — including when a
    // phase-level assignment newly covers them after sync. Skip only if nothing about the
    // assignee actually moved.
    if (assignedToId && existing.assignedToId !== assignedToId) {
      await this.notifyAssigned(actor, updated, assignedToId, label);
    }
    await this.moveTo(actor, updated, fromSummary);
  }

  private async notifyAssigned(
    actor: AuthenticatedUser,
    task: TaskSummaryRow,
    assignedToId: string,
    label: string,
  ): Promise<void> {
    await this.events.notify(
      actor,
      task,
      NOTIFICATION_TYPE.TASK_ASSIGNED,
      [assignedToId],
      label,
      `TASK_ASSIGNED:${task.id}:${assignedToId}`,
    );
  }
}

function testersOn(project: ProjectRow) {
  return project.members
    .filter((member) => member.role === PROJECT_MEMBER_ROLE.TESTER)
    .map((member) => member.user)
    .sort((left, right) => left.name.localeCompare(right.name));
}
