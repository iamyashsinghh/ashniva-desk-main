import { Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  NOTIFICATION_TYPE,
  PRIORITY,
  PROJECT_MEMBER_ROLE,
  TASK_STATUS,
  effectiveWorkPlanAssigneeId,
  effectiveWorkPlanPriority,
  type AuthenticatedUser,
  type Priority,
} from '@ashniva/types';

import { TaskEventsService } from '../tasks/task-events.service';
import { TasksRepository } from '../tasks/tasks.repository';
import type { ProjectRow } from '../projects/projects.repository';
import type { WorkPlanRow } from './work-plan.mapper';

const EDITABLE = new Set<string>([TASK_STATUS.DRAFT, TASK_STATUS.ASSIGNED]);

/**
 * Turns Summary assignments into real tasks so the developer and tester work them on the
 * task board the same way as any other ticket of work.
 */
@Injectable()
export class WorkPlanTasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly events: TaskEventsService,
  ) {}

  async sync(actor: AuthenticatedUser, project: ProjectRow, row: WorkPlanRow): Promise<void> {
    const testerId = testersOn(project)[0]?.id ?? null;
    for (const phase of row.phases) {
      for (const title of phase.titles) {
        await this.syncTitle(actor, project.id, row, phase, title, testerId);
      }
    }
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

    if (!assignedToId) {
      if (existing && EDITABLE.has(existing.status)) {
        await this.tasks.update(actor.organizationId, existing.id, {
          assignedToId: null,
          status: TASK_STATUS.DRAFT,
        });
      }
      return;
    }

    if (!existing) {
      const created = await this.tasks.create(actor.organizationId, {
        projectId,
        title: taskTitle,
        description,
        status: TASK_STATUS.ASSIGNED,
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
      await this.events.notify(actor, created, NOTIFICATION_TYPE.TASK_ASSIGNED, [assignedToId]);
      return;
    }

    if (!EDITABLE.has(existing.status)) {
      return;
    }

    const assigneeChanged = existing.assignedToId !== assignedToId;
    const updated = await this.tasks.update(actor.organizationId, existing.id, {
      title: taskTitle,
      description,
      priority,
      assignedToId,
      testerId,
      estimateMinutes,
      status: TASK_STATUS.ASSIGNED,
      deletedAt: null,
      module: existing.module ?? 'Work plan',
    });
    if (assigneeChanged) {
      await this.events.notify(actor, updated, NOTIFICATION_TYPE.TASK_ASSIGNED, [assignedToId]);
    }
  }
}

function testersOn(project: ProjectRow) {
  return project.members
    .filter((member) => member.role === PROJECT_MEMBER_ROLE.TESTER)
    .map((member) => member.user)
    .sort((left, right) => left.name.localeCompare(right.name));
}
