import type { DailyReportItem, DailyReportSnapshot, TaskStatus } from '@ashniva/types';

/** A task the person touched on the report day (assigned to them, or they logged time on it). */
export interface DailyReportTaskInput {
  id: string;
  taskKey: string;
  title: string;
  projectId: string;
  projectName: string;
  status: TaskStatus;
  clientVisible: boolean;
  completedAt: Date | null;
  submittedAt: Date | null;
}

export interface DailyReportWorkLogInput {
  taskId: string;
  minutes: number;
  summary: string;
}

export interface DailyReportInput {
  /** Start (inclusive) and end (exclusive) of the report day in UTC. */
  dayStart: Date;
  dayEnd: Date;
  tasks: DailyReportTaskInput[];
  workLogs: DailyReportWorkLogInput[];
}

function isWithin(value: Date | null, start: Date, end: Date): boolean {
  return value !== null && value >= start && value < end;
}

/**
 * Pure aggregation used by the reports service (live and snapshot) and by the seed, so the
 * numbers on the Daily Reports screen always come from one definition.
 */
export function buildDailyReportSnapshot(input: DailyReportInput): DailyReportSnapshot {
  const minutesByTask = new Map<string, number>();
  const summariesByTask = new Map<string, string[]>();
  for (const log of input.workLogs) {
    minutesByTask.set(log.taskId, (minutesByTask.get(log.taskId) ?? 0) + log.minutes);
    const summaries = summariesByTask.get(log.taskId) ?? [];
    summaries.push(log.summary);
    summariesByTask.set(log.taskId, summaries);
  }

  const items: DailyReportItem[] = input.tasks
    .map((task) => ({
      taskId: task.id,
      taskKey: task.taskKey,
      title: task.title,
      projectId: task.projectId,
      projectName: task.projectName,
      status: task.status,
      minutes: minutesByTask.get(task.id) ?? 0,
      summaries: summariesByTask.get(task.id) ?? [],
      completedToday: isWithin(task.completedAt, input.dayStart, input.dayEnd),
      submittedForReviewToday: isWithin(task.submittedAt, input.dayStart, input.dayEnd),
      clientVisible: task.clientVisible,
    }))
    // Only tasks with activity on that day appear on the report.
    .filter((item) => item.minutes > 0 || item.completedToday || item.submittedForReviewToday)
    .sort((a, b) => b.minutes - a.minutes || a.taskKey.localeCompare(b.taskKey));

  return {
    minutesLogged: items.reduce((total, item) => total + item.minutes, 0),
    tasksCompleted: items.filter((item) => item.completedToday).length,
    tasksSubmitted: items.filter((item) => item.submittedForReviewToday).length,
    tasksWorkedOn: items.length,
    items,
  };
}

/** UTC day boundaries for a YYYY-MM-DD string. */
export function dayBounds(reportDate: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = new Date(`${reportDate}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  return { dayStart, dayEnd };
}

export function toReportDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
