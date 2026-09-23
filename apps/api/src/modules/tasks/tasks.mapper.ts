import {
  OPEN_TASK_STATUSES,
  type ClientUpdateStatus,
  type ClientUpdateSummary,
  type CommentSummary,
  type FileSummary,
  type Priority,
  type TaskActionAvailability,
  type TaskCategoryKind,
  type TaskDetail,
  type TaskHistoryEntry,
  type TaskStatus,
  type TaskSummary,
  type Visibility,
  type WorkLogSummary,
  computeTaskTiming,
  isUpcoming,
} from '@ashniva/types';

import type { CommentRow } from './comments.repository';
import type { TaskDetailRow, TaskSummaryRow } from './tasks.repository';

export function taskKey(task: { number: number; project: { code: string } }): string {
  return `${task.project.code}-${task.number}`;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function isOverdue(task: { dueDate: Date | null; status: string }, today: Date): boolean {
  return (
    task.dueDate !== null &&
    task.dueDate < today &&
    OPEN_TASK_STATUSES.includes(task.status as TaskStatus)
  );
}

export function todayUtc(): Date {
  return new Date(new Date().toISOString().slice(0, 10));
}

export function toTaskSummary(row: TaskSummaryRow, today = todayUtc()): TaskSummary {
  const loggedMinutes = row.workLogs.reduce((sum, log) => sum + log.minutes, 0);
  return {
    id: row.id,
    key: taskKey(row),
    number: row.number,
    title: row.title,
    status: row.status as TaskStatus,
    priority: row.priority as Priority,
    milestone: row.milestone,
    changeRequest: row.changeRequest
      ? {
          id: row.changeRequest.id,
          number: `CR-${row.changeRequest.number}`,
          title: row.changeRequest.title,
        }
      : null,
    project: { id: row.project.id, code: row.project.code, name: row.project.name },
    clientOrganization: row.project.clientOrganization,
    category: row.category
      ? {
          id: row.category.id,
          name: row.category.name,
          kind: row.category.kind as TaskCategoryKind,
        }
      : null,
    module: row.module,
    isInternTask: row.isInternTask,
    assignedTo: row.assignedTo,
    createdBy: row.createdBy,
    reviewer: row.reviewer,
    tester: row.tester,
    dueDate: dateOnly(row.dueDate),
    scheduledStartAt: iso(row.scheduledStartAt),
    dueAt: iso(row.dueAt),
    workAreas: row.workAreas,
    isUpcoming: isUpcoming(row.scheduledStartAt),
    // Computed here rather than stored, so the verdict cannot outlive the dates it came from.
    timing: computeTaskTiming({
      dueAt: row.dueAt,
      completedAt: row.completedAt,
      estimateMinutes: row.estimateMinutes,
      loggedMinutes,
    }),
    estimateMinutes: row.estimateMinutes,
    loggedMinutes,
    clientVisible: row.clientVisible,
    isOverdue: isOverdue(row, today),
    ticket: row.ticket,
    startedAt: iso(row.startedAt),
    submittedAt: iso(row.submittedAt),
    completedAt: iso(row.completedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toComment(row: CommentRow & { files?: TaskDetailRow['files'] }): CommentSummary {
  return {
    id: row.id,
    body: row.body,
    visibility: row.visibility as Visibility,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
    files: row.files?.map(toFile) ?? [],
  };
}

export function toHistoryEntry(row: TaskDetailRow['statusHistory'][number]): TaskHistoryEntry {
  return {
    id: row.id,
    fromStatus: row.fromStatus as TaskStatus | null,
    toStatus: row.toStatus as TaskStatus,
    changedBy: row.changedBy,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWorkLog(
  row: TaskDetailRow['workLogs'][number],
  task: {
    id: string;
    number: number;
    title: string;
    project: { id: string; code: string; name: string };
  },
): WorkLogSummary {
  return {
    id: row.id,
    task: { id: task.id, key: taskKey(task), title: task.title },
    project: { id: task.project.id, code: task.project.code, name: task.project.name },
    user: row.user,
    workDate: row.workDate.toISOString().slice(0, 10),
    minutes: row.minutes,
    summary: row.summary,
    proofUrl: row.proofUrl,
    gitRef: row.gitRef,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toFile(row: TaskDetailRow['files'][number]): FileSummary {
  return {
    id: row.id,
    name: row.name,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility as Visibility,
    caption: row.caption,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toClientUpdate(
  row: TaskDetailRow['clientUpdates'][number],
  task: { id: string; number: number; title: string; project: { code: string } } | null,
): ClientUpdateSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as ClientUpdateStatus,
    workDate: row.workDate.toISOString().slice(0, 10),
    project: row.project,
    clientOrganization: row.clientOrganization,
    task: task ? { id: task.id, key: taskKey(task), title: task.title } : null,
    ticket: row.ticket,
    author: row.author,
    publishedBy: row.publishedBy,
    publishedAt: iso(row.publishedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTaskDetail(
  row: TaskDetailRow,
  actions: TaskActionAvailability[],
  options: { includeInternalComments: boolean },
): TaskDetail {
  const clientUpdate = row.clientUpdates[0];
  return {
    ...toTaskSummary(row),
    description: row.description,
    acceptanceCriteria: row.acceptanceCriteria,
    blockedReason: row.blockedReason,
    history: row.statusHistory.map(toHistoryEntry),
    comments: row.comments
      .filter((comment) => options.includeInternalComments || comment.visibility === 'CLIENT')
      .map(toComment),
    workLogs: row.workLogs.map((log) => toWorkLog(log, row)),
    files: row.files.map(toFile),
    clientUpdate: clientUpdate ? toClientUpdate(clientUpdate, row) : null,
    actions,
  };
}
