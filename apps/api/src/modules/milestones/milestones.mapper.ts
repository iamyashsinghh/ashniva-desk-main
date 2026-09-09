import {
  MILESTONE_STATUS,
  OPEN_TASK_STATUSES,
  type MilestoneDetail,
  type MilestoneHistoryEntry,
  type MilestoneProgressMode,
  type MilestoneStatus,
  type MilestoneSummary,
  type PortalMilestoneSummary,
} from '@ashniva/types';

import type { MilestoneDetailRow, MilestoneSummaryRow } from './milestones.repository';

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function isMilestoneOverdue(
  row: { dueDate: Date | null; status: string },
  today: Date,
): boolean {
  return (
    row.dueDate !== null &&
    row.dueDate < today &&
    row.status !== MILESTONE_STATUS.COMPLETED &&
    row.status !== MILESTONE_STATUS.CANCELLED
  );
}

/** Pure progress rule: tasks when there are any, else deliverables, else 0. */
export function computeProgress(inputs: {
  taskTotal: number;
  taskDone: number;
  deliverableTotal: number;
  deliverableDone: number;
}): number {
  if (inputs.taskTotal > 0) {
    return Math.round((inputs.taskDone / inputs.taskTotal) * 100);
  }
  if (inputs.deliverableTotal > 0) {
    return Math.round((inputs.deliverableDone / inputs.deliverableTotal) * 100);
  }
  return 0;
}

export function toMilestoneSummary(
  row: MilestoneSummaryRow,
  approvalStatus: string | null = null,
  today = new Date(),
): MilestoneSummary {
  const done = row.tasks.filter(
    (task) => !OPEN_TASK_STATUSES.includes(task.status as never),
  ).length;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    project: { id: row.project.id, code: row.project.code, name: row.project.name },
    contract: row.contract
      ? { id: row.contract.id, number: row.contract.numberLabel, title: row.contract.title }
      : null,
    owner: row.owner,
    startDate: dateOnly(row.startDate),
    dueDate: dateOnly(row.dueDate),
    status: row.status as MilestoneStatus,
    progressPercent: row.progressPercent,
    progressMode: row.progressMode as MilestoneProgressMode,
    clientVisible: row.clientVisible,
    requiresApproval: row.requiresApproval,
    approvalStatus,
    isOverdue: isMilestoneOverdue(row, today),
    deliverableCount: row.deliverables.length,
    deliverablesDone: row.deliverables.filter((item) => item.isDone).length,
    linkedTaskCount: row.tasks.length,
    linkedTasksCompleted: done,
    completedAt: iso(row.completedAt),
    sortOrder: row.sortOrder,
  };
}

export function toMilestoneHistory(
  row: MilestoneDetailRow['history'][number],
): MilestoneHistoryEntry {
  return {
    id: row.id,
    kind: row.kind,
    fromValue: row.fromValue,
    toValue: row.toValue,
    reason: row.reason,
    changedBy: row.changedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMilestoneDetail(
  row: MilestoneDetailRow,
  approvalStatus: string | null = null,
  today = new Date(),
): MilestoneDetail {
  return {
    ...toMilestoneSummary(row, approvalStatus, today),
    deliverables: row.deliverables.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      isDone: item.isDone,
      doneAt: iso(item.doneAt),
      sortOrder: item.sortOrder,
    })),
    dependsOn: row.dependsOn.map((edge) => edge.dependsOn),
    dependents: row.dependents.map((edge) => edge.milestone),
    linkedTasks: row.tasks.map((task) => ({
      id: task.id,
      key: `${task.project.code}-${task.number}`,
      title: task.title,
      status: task.status,
    })),
    history: row.history.map(toMilestoneHistory),
    changeRequest: row.changeRequest
      ? {
          id: row.changeRequest.id,
          number: `CR-${row.changeRequest.number}`,
          title: row.changeRequest.title,
        }
      : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Portal allow-list: no owner, no history, no internal deliverable notes. */
export function toPortalMilestone(
  row: MilestoneSummaryRow,
  approvalStatus: string | null = null,
): PortalMilestoneSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    project: { id: row.project.id, code: row.project.code, name: row.project.name },
    startDate: dateOnly(row.startDate),
    dueDate: dateOnly(row.dueDate),
    status: row.status as MilestoneStatus,
    progressPercent: row.progressPercent,
    requiresApproval: row.requiresApproval,
    approvalStatus,
    deliverables: row.deliverables.map((item) => ({
      id: item.id,
      title: item.title,
      isDone: item.isDone,
    })),
    completedAt: iso(row.completedAt),
  };
}
