import type { TaskTimingResult } from '../workflow/task-timing';
import type { ClientUpdateStatus } from '../domain/client-update-status';
import type { Priority } from '../domain/priority';
import type { ProjectMemberRole } from '../domain/project-member-role';
import type { ProjectHealth, ProjectStatus } from '../domain/project-status';
import type { ProjectType } from '../domain/project-type';
import type { TaskCategoryKind } from '../domain/task-category-kind';
import type { Visibility } from '../domain/visibility';
import type { TaskStatus } from '../workflow/task-status';
import type { OrganizationRef, TeamRef, UserRef } from './identity';

// ---------------------------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------------------------

export interface ProjectRef {
  id: string;
  code: string;
  name: string;
}

export interface TaskCounts {
  total: number;
  open: number;
  inProgress: number;
  inReview: number;
  blocked: number;
  completed: number;
  overdue: number;
}

export interface ProjectSummary extends ProjectRef {
  description: string | null;
  type: ProjectType;
  status: ProjectStatus;
  health: ProjectHealth;
  clientOrganization: OrganizationRef | null;
  manager: UserRef | null;
  lead: UserRef | null;
  team: TeamRef | null;
  startDate: string | null;
  targetDate: string | null;
  requiresClientUat: boolean;
  /** Completed ÷ (total − cancelled), 0–100. */
  progressPercent: number;
  taskCounts: TaskCounts;
  openTicketCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMemberSummary extends UserRef {
  role: ProjectMemberRole;
  /**
   * What this person is responsible for here — Frontend, API, DevOps. Free-form tags; one person
   * may hold several. The support router matches a ticket's area against these.
   */
  responsibilities: string[];
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMemberSummary[];
}

// ---------------------------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------------------------

export const TASK_LIST_VIEW = {
  MY: 'my',
  /** Assigned, but the scheduled start is still ahead — work that is coming, not work to do now. */
  UPCOMING: 'upcoming',
  BY_ME: 'by-me',
  TEAM: 'team',
  TODAY: 'today',
  OVERDUE: 'overdue',
  REVIEW: 'review',
  DONE: 'done',
  ALL: 'all',
} as const;

export type TaskListView = (typeof TASK_LIST_VIEW)[keyof typeof TASK_LIST_VIEW];

export interface TaskCategoryRef {
  id: string;
  name: string;
  kind: TaskCategoryKind;
}

export interface TicketRef {
  id: string;
  number: number;
  title: string;
}

export interface TaskRef {
  id: string;
  /** "<project code>-<number>" */
  key: string;
  title: string;
}

export interface TaskSummary extends TaskRef {
  number: number;
  status: TaskStatus;
  priority: Priority;
  project: ProjectRef;
  clientOrganization: OrganizationRef | null;
  category: TaskCategoryRef | null;
  module: string | null;
  assignedTo: UserRef | null;
  createdBy: UserRef;
  reviewer: UserRef | null;
  tester: UserRef | null;
  dueDate: string | null;
  /** When the work is meant to begin; null when it can be picked up now. */
  scheduledStartAt: string | null;
  /** Expected completion as an instant — what `timing` is measured against. */
  dueAt: string | null;
  /** What the work is: Frontend, API, Database… */
  workAreas: string[];
  /** True while the scheduled start is still ahead: assigned, but not yet workable. */
  isUpcoming: boolean;
  /**
   * Estimated versus actual, and whether it was late. Computed on read from the timestamps, so it
   * cannot disagree with them. Operational timing only — it is not a score about a person.
   */
  timing: TaskTimingResult;
  estimateMinutes: number | null;
  loggedMinutes: number;
  clientVisible: boolean;
  isOverdue: boolean;
  ticket: TicketRef | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  milestone: { id: string; name: string } | null;
  changeRequest: { id: string; number: string; title: string } | null;
}

/** Actions on the task detail screen; the API decides which are enabled for the caller. */
export const TASK_ACTION = {
  ASSIGN: 'assign',
  START: 'start',
  BLOCK: 'block',
  UNBLOCK: 'unblock',
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  REOPEN: 'reopen',
  CANCEL: 'cancel',
  EDIT: 'edit',
  LOG_WORK: 'log-work',
} as const;

export type TaskAction = (typeof TASK_ACTION)[keyof typeof TASK_ACTION];

export interface TaskActionAvailability {
  action: TaskAction;
  enabled: boolean;
  /** Why the action is disabled for this user right now (shown as the button hint). */
  reason?: string;
}

export interface TaskHistoryEntry {
  id: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  changedBy: UserRef;
  note: string | null;
  createdAt: string;
}

export interface CommentSummary {
  id: string;
  body: string;
  visibility: Visibility;
  author: UserRef;
  createdAt: string;
  files?: FileSummary[];
}

export interface WorkLogSummary {
  id: string;
  task: TaskRef;
  project: ProjectRef;
  user: UserRef;
  workDate: string;
  minutes: number;
  summary: string;
  proofUrl: string | null;
  gitRef: string | null;
  createdAt: string;
}

export interface FileSummary {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  visibility: Visibility;
  uploadedBy: UserRef;
  createdAt: string;
}

export interface ClientUpdateSummary {
  id: string;
  title: string;
  body: string;
  status: ClientUpdateStatus;
  workDate: string;
  project: ProjectRef;
  clientOrganization: OrganizationRef;
  task: TaskRef | null;
  ticket: TicketRef | null;
  author: UserRef;
  publishedBy: UserRef | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface TaskDetail extends TaskSummary {
  description: string | null;
  acceptanceCriteria: string | null;
  blockedReason: string | null;
  history: TaskHistoryEntry[];
  comments: CommentSummary[];
  workLogs: WorkLogSummary[];
  files: FileSummary[];
  clientUpdate: ClientUpdateSummary | null;
  actions: TaskActionAvailability[];
}

/** Realtime payloads (Socket.IO events `task.updated`, `ticket.updated`, `update.published`). */
export interface EntityChangedEvent {
  id: string;
  projectId: string | null;
  status: string;
  changedByUserId: string;
  at: string;
}
