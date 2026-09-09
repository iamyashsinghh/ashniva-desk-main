import { TASK_STATUS, type TaskStatus } from '@ashniva/types';

import type { PrismaClient, Task, TaskCategory } from '../../src/generated/prisma/client';
import { at, dayOffset, raiseCounter } from './seed-helpers';
import type { SeededOrganizations } from './seed-organizations';
import type { SeededProjects } from './seed-projects';
import { TASK_SEEDS, type TaskSeed } from './seed-tasks-data';
import type { SeededUsers, SeedUserKey } from './seed-users';

const S = TASK_STATUS;

/** The sequence of statuses a task went through to reach its current status. */
function statusPath(status: TaskStatus): TaskStatus[] {
  switch (status) {
    case S.DRAFT:
      return [S.DRAFT];
    case S.ASSIGNED:
      return [S.ASSIGNED];
    case S.IN_PROGRESS:
      return [S.ASSIGNED, S.IN_PROGRESS];
    case S.IN_REVIEW:
      return [S.ASSIGNED, S.IN_PROGRESS, S.IN_REVIEW];
    case S.RETURNED_TO_DEV:
      return [S.ASSIGNED, S.IN_PROGRESS, S.IN_REVIEW, S.RETURNED_TO_DEV];
    case S.BLOCKED:
      return [S.ASSIGNED, S.IN_PROGRESS, S.BLOCKED];
    case S.COMPLETED:
      return [S.ASSIGNED, S.IN_PROGRESS, S.IN_REVIEW, S.COMPLETED];
    case S.REOPENED:
      return [S.ASSIGNED, S.IN_PROGRESS, S.IN_REVIEW, S.COMPLETED, S.REOPENED];
    case S.CANCELLED:
      return [S.ASSIGNED, S.CANCELLED];
    default:
      return [S.ASSIGNED, status];
  }
}

/** Who performed each step: creators assign/reopen/cancel, assignees work, testers decide. */
function actorFor(status: TaskStatus, seed: TaskSeed): SeedUserKey {
  switch (status) {
    case S.IN_PROGRESS:
    case S.IN_REVIEW:
    case S.BLOCKED:
      return seed.assignee ?? seed.createdBy;
    case S.COMPLETED:
    case S.RETURNED_TO_DEV:
      return seed.tester ?? seed.reviewer ?? seed.createdBy;
    default:
      return seed.createdBy;
  }
}

/** Evenly spaced timestamps from creation to the last change (same-day changes are hours apart). */
function stepTimes(seed: TaskSeed, steps: number): Date[] {
  const start = at(-seed.ageDays, 9).getTime();
  let end = at(-seed.lastChangeDaysAgo, 15).getTime();
  if (end <= start) {
    end = start + steps * 60 * 60 * 1000;
  }
  if (steps === 1) {
    return [new Date(start)];
  }
  return Array.from(
    { length: steps },
    (_, index) => new Date(start + ((end - start) * index) / (steps - 1)),
  );
}

interface SeedTasksContext {
  organizations: SeededOrganizations;
  users: SeededUsers;
  projects: SeededProjects;
  categories: Map<string, TaskCategory>;
}

export async function seedTasks(
  prisma: PrismaClient,
  context: SeedTasksContext,
): Promise<Map<number, Task>> {
  const { users, projects, categories } = context;
  const organizationId = context.organizations.serviceProvider.id;
  const tasksByNumber = new Map<number, Task>();

  for (const seed of TASK_SEEDS) {
    const path = statusPath(seed.status);
    const times = stepTimes(seed, path.length);
    const timeOf = (status: TaskStatus): Date | null => {
      const index = path.lastIndexOf(status);
      return index === -1 ? null : (times[index] ?? null);
    };
    const completedAt = seed.status === S.COMPLETED ? timeOf(S.COMPLETED) : null;
    const project = projects[seed.project];
    const category = categories.get(seed.category);
    if (!category) {
      throw new Error(`Unknown task category "${seed.category}"`);
    }

    const data = {
      projectId: project.id,
      title: seed.title,
      description: seed.description,
      status: seed.status,
      priority: seed.priority,
      categoryId: category.id,
      module: seed.module ?? null,
      assignedToId: seed.assignee ? users[seed.assignee].id : null,
      createdById: users[seed.createdBy].id,
      reviewerId: seed.reviewer ? users[seed.reviewer].id : null,
      testerId: seed.tester ? users[seed.tester].id : null,
      dueDate: seed.due === undefined ? null : dayOffset(seed.due),
      estimateMinutes: seed.estimateMinutes ?? null,
      clientVisible: seed.clientVisible ?? false,
      blockedReason: seed.status === S.BLOCKED ? (seed.blockedReason ?? null) : null,
      startedAt: timeOf(S.IN_PROGRESS),
      submittedAt: timeOf(S.IN_REVIEW),
      completedAt,
      createdAt: times[0],
      deletedAt: null,
    };

    const task = await prisma.task.upsert({
      where: { organizationId_number: { organizationId, number: seed.number } },
      update: data,
      create: { ...data, organizationId, number: seed.number },
    });
    tasksByNumber.set(seed.number, task);

    // Child rows are rebuilt each run so the demo data stays exactly as defined here.
    await prisma.taskStatusHistory.deleteMany({ where: { taskId: task.id } });
    await prisma.comment.deleteMany({ where: { taskId: task.id } });
    await prisma.workLog.deleteMany({ where: { taskId: task.id } });
    await prisma.clientUpdate.deleteMany({ where: { taskId: task.id } });

    await prisma.taskStatusHistory.createMany({
      data: path.map((status, index) => ({
        taskId: task.id,
        fromStatus: index === 0 ? null : path[index - 1],
        toStatus: status,
        changedById: users[actorFor(status, seed)].id,
        note:
          index === path.length - 1
            ? (seed.lastNote ?? (status === S.BLOCKED ? seed.blockedReason : null) ?? null)
            : null,
        createdAt: times[index],
      })),
    });

    if (seed.workLogs?.length) {
      await prisma.workLog.createMany({
        data: seed.workLogs.map((log) => ({
          organizationId,
          taskId: task.id,
          userId: users[log.user].id,
          workDate: dayOffset(log.dayOffset),
          minutes: log.minutes,
          summary: log.summary,
          gitRef: log.gitRef ?? null,
          createdAt: at(log.dayOffset, 17),
        })),
      });
    }

    if (seed.comments?.length) {
      await prisma.comment.createMany({
        data: seed.comments.map((comment) => ({
          organizationId,
          taskId: task.id,
          authorId: users[comment.author].id,
          visibility: comment.visibility,
          body: comment.body,
          createdAt: at(comment.dayOffset, 11),
        })),
      });
    }

    if (seed.clientUpdate && completedAt && project.clientOrganizationId) {
      const published = seed.clientUpdate.status === 'PUBLISHED';
      await prisma.clientUpdate.create({
        data: {
          organizationId,
          clientOrganizationId: project.clientOrganizationId,
          projectId: project.id,
          taskId: task.id,
          workDate: dayOffset(-seed.lastChangeDaysAgo),
          title: seed.title,
          body: seed.clientUpdate.body,
          status: seed.clientUpdate.status,
          authorId: users[seed.assignee ?? seed.createdBy].id,
          publishedById: published ? users.lead.id : null,
          publishedAt: published ? new Date(completedAt.getTime() + 30 * 60 * 1000) : null,
          createdAt: completedAt,
        },
      });
    }
  }

  await raiseCounter(
    prisma,
    organizationId,
    'TASK',
    Math.max(...TASK_SEEDS.map((seed) => seed.number)),
  );

  console.warn(`Tasks: ${TASK_SEEDS.length}`);
  return tasksByNumber;
}
