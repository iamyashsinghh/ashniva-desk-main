import {
  PROJECT_HEALTH,
  PROJECT_STATUS,
  TASK_STATUS,
  type ProjectDetail,
  type ProjectHealth,
  type ProjectMemberRole,
  type ProjectStatus,
  type ProjectSummary,
  type ProjectType,
  type TaskCounts,
} from '@ashniva/types';

import type { ProjectCounts, ProjectRow } from './projects.repository';

const EMPTY_COUNTS: ProjectCounts = { byStatus: {}, overdue: 0, openTickets: 0 };

function count(counts: ProjectCounts, status: string): number {
  return counts.byStatus[status] ?? 0;
}

export function toTaskCounts(counts: ProjectCounts): TaskCounts {
  const total = Object.values(counts.byStatus).reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const completed = count(counts, TASK_STATUS.COMPLETED);
  const cancelled = count(counts, TASK_STATUS.CANCELLED);
  return {
    total,
    open: total - completed - cancelled,
    inProgress: count(counts, TASK_STATUS.IN_PROGRESS),
    inReview: count(counts, TASK_STATUS.IN_REVIEW),
    blocked: count(counts, TASK_STATUS.BLOCKED),
    completed,
    overdue: counts.overdue,
  };
}

export function progressPercent(taskCounts: TaskCounts, cancelled: number): number {
  const denominator = taskCounts.total - cancelled;
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((taskCounts.completed / denominator) * 100);
}

/**
 * Health is derived, never stored: overdue work or a missed target date means DELAYED,
 * blockers or open critical tickets mean AT_RISK, anything else is ON_TRACK.
 */
export function projectHealth(
  status: ProjectStatus,
  taskCounts: TaskCounts,
  targetDate: Date | null,
  today: Date,
): ProjectHealth {
  if (status !== PROJECT_STATUS.ACTIVE) {
    return PROJECT_HEALTH.ON_TRACK;
  }
  if (
    taskCounts.overdue > 0 ||
    (targetDate !== null && targetDate < today && taskCounts.open > 0)
  ) {
    return PROJECT_HEALTH.DELAYED;
  }
  if (taskCounts.blocked > 0) {
    return PROJECT_HEALTH.AT_RISK;
  }
  return PROJECT_HEALTH.ON_TRACK;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function toProjectSummary(
  row: ProjectRow,
  counts: ProjectCounts = EMPTY_COUNTS,
  today = new Date(),
): ProjectSummary {
  const taskCounts = toTaskCounts(counts);
  const status = row.status as ProjectStatus;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    type: row.type as ProjectType,
    status,
    health: projectHealth(status, taskCounts, row.targetDate, today),
    clientOrganization: row.clientOrganization,
    manager: row.manager,
    lead: row.lead,
    team: row.team ? { id: row.team.id, name: row.team.name } : null,
    startDate: dateOnly(row.startDate),
    targetDate: dateOnly(row.targetDate),
    requiresClientUat: row.requiresClientUat,
    progressPercent: progressPercent(taskCounts, count(counts, TASK_STATUS.CANCELLED)),
    taskCounts,
    openTicketCount: counts.openTickets,
    memberCount: row.members.length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toProjectDetail(row: ProjectRow, counts?: ProjectCounts): ProjectDetail {
  return {
    ...toProjectSummary(row, counts),
    members: row.members.map((member) => ({
      ...member.user,
      role: member.role as ProjectMemberRole,
      responsibilities: member.responsibilities,
    })),
  };
}
