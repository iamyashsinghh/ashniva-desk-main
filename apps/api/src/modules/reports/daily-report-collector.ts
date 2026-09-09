import type { TaskStatus } from '@ashniva/types';

import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import {
  buildDailyReportSnapshot,
  dayBounds,
  type DailyReportInput,
  type DailyReportTaskInput,
} from './daily-report-builder';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Loads everything a person's daily report is made of: their work logs for the day plus the
 * tasks assigned to them that were completed or submitted for review that day.
 * Plain function (no Nest DI) so the seed and the reports service share it.
 */
export async function collectDailyReportInput(
  db: Db,
  organizationId: string,
  userId: string,
  reportDate: string,
): Promise<DailyReportInput> {
  const { dayStart, dayEnd } = dayBounds(reportDate);

  const workLogs = await db.workLog.findMany({
    where: { organizationId, userId, workDate: dayStart },
    orderBy: { createdAt: 'asc' },
    select: { taskId: true, minutes: true, summary: true },
  });

  const loggedTaskIds = [...new Set(workLogs.map((log) => log.taskId))];
  const tasks = await db.task.findMany({
    where: {
      organizationId,
      deletedAt: null,
      OR: [
        { id: { in: loggedTaskIds } },
        { assignedToId: userId, completedAt: { gte: dayStart, lt: dayEnd } },
        { assignedToId: userId, submittedAt: { gte: dayStart, lt: dayEnd } },
      ],
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      clientVisible: true,
      completedAt: true,
      submittedAt: true,
      project: { select: { id: true, code: true, name: true } },
    },
  });

  const taskInputs: DailyReportTaskInput[] = tasks.map((task) => ({
    id: task.id,
    taskKey: `${task.project.code}-${task.number}`,
    title: task.title,
    projectId: task.project.id,
    projectName: task.project.name,
    status: task.status as TaskStatus,
    clientVisible: task.clientVisible,
    completedAt: task.completedAt,
    submittedAt: task.submittedAt,
  }));

  return { dayStart, dayEnd, tasks: taskInputs, workLogs };
}

/** Rebuilds and stores the snapshot for one person and day. Returns the stored row. */
export async function refreshDailyReport(
  db: Db,
  organizationId: string,
  userId: string,
  reportDate: string,
) {
  const input = await collectDailyReportInput(db, organizationId, userId, reportDate);
  // DailyReportSnapshot is plain JSON but has no index signature, which Prisma's JSON input type
  // requires; the cast is safe because the builder only produces strings, numbers and booleans.
  const snapshot = buildDailyReportSnapshot(input) as unknown as Prisma.InputJsonValue;
  const reportDay = input.dayStart;
  return db.dailyReport.upsert({
    where: { userId_reportDate: { userId, reportDate: reportDay } },
    update: { snapshot, generatedAt: new Date() },
    create: { organizationId, userId, reportDate: reportDay, snapshot, generatedAt: new Date() },
  });
}
