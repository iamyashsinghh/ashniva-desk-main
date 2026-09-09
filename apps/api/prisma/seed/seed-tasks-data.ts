import type { ClientUpdateStatus, Priority, TaskStatus, Visibility } from '@ashniva/types';

import { ACME_POS_TASKS } from './seed-tasks-acme-pos';
import { ACME_MORE_TASKS } from './seed-tasks-acme-more';
import { ZENITH_TASKS } from './seed-tasks-zenith';
import { INTERNAL_TASKS } from './seed-tasks-internal';
import type { SeedProjectKey } from './seed-projects';
import type { SeedUserKey } from './seed-users';

export interface WorkLogSeed {
  user: SeedUserKey;
  dayOffset: number;
  minutes: number;
  summary: string;
  gitRef?: string;
}

export interface CommentSeed {
  author: SeedUserKey;
  visibility: Visibility;
  body: string;
  dayOffset: number;
}

export interface TaskSeed {
  number: number;
  project: SeedProjectKey;
  title: string;
  description: string;
  category: string;
  status: TaskStatus;
  priority: Priority;
  createdBy: SeedUserKey;
  assignee?: SeedUserKey;
  reviewer?: SeedUserKey;
  tester?: SeedUserKey;
  /** Days from today (negative = past). */
  due?: number;
  /** Days ago the task was created. */
  ageDays: number;
  /** Days ago the last status change happened (0 = today). */
  lastChangeDaysAgo: number;
  estimateMinutes?: number;
  module?: string;
  clientVisible?: boolean;
  blockedReason?: string;
  /** Note stored on the final status-history row (review outcome, reopen reason …). */
  lastNote?: string;
  workLogs?: WorkLogSeed[];
  comments?: CommentSeed[];
  /** Only meaningful for COMPLETED + clientVisible tasks. */
  clientUpdate?: { status: ClientUpdateStatus; body: string };
}

/** Demo tasks: at least one in every Phase 1 status, spread across projects and people. */
export const TASK_SEEDS: readonly TaskSeed[] = [
  ...ACME_POS_TASKS,
  ...ACME_MORE_TASKS,
  ...ZENITH_TASKS,
  ...INTERNAL_TASKS,
];
