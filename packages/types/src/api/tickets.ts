import type { Priority } from '../domain/priority';
import type { TicketSource } from '../domain/ticket-source';
import type { TicketType } from '../domain/ticket-type';
import type { TaskStatus } from '../workflow/task-status';
import type { TicketStatus } from '../workflow/ticket-status';
import type { OrganizationRef, TeamRef, UserRef } from './identity';
import type { TicketSla } from './sla';
import type { CommentSummary, FileSummary, ProjectRef, TaskRef } from './work';

export const TICKET_LIST_VIEW = {
  OPEN: 'open',
  NEW: 'new',
  MINE: 'mine',
  WAITING: 'waiting',
  CRITICAL: 'critical',
  /** Open tickets past their SLA warning time — the destination of the "SLA at risk" KPI. */
  SLA_AT_RISK: 'sla-at-risk',
  /** Open tickets past their SLA due time — the destination of the "SLA breached" KPI. */
  SLA_BREACHED: 'sla-breached',
  RESOLVED: 'resolved',
  ALL: 'all',
} as const;

export type TicketListView = (typeof TICKET_LIST_VIEW)[keyof typeof TICKET_LIST_VIEW];

export interface TicketSummary {
  id: string;
  number: number;
  /** "T-<number>" */
  key: string;
  title: string;
  type: TicketType;
  priority: Priority;
  status: TicketStatus;
  source: TicketSource;
  project: ProjectRef | null;
  clientOrganization: OrganizationRef;
  requester: UserRef;
  assignedTo: UserRef | null;
  team: TeamRef | null;
  module: string | null;
  /** The build the reporter said they were on. Free text: a client names their own version. */
  productVersion: string | null;
  linkedTaskCount: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  /** Backend-computed SLA state; null when no policy applies. */
  sla: TicketSla | null;
}

export const TICKET_ACTION = {
  ASSIGN: 'assign',
  START: 'start',
  WAIT_CLIENT: 'wait-client',
  RESUME: 'resume',
  REVIEW: 'review',
  RESOLVE: 'resolve',
  CLOSE: 'close',
  REOPEN: 'reopen',
  CANCEL: 'cancel',
  CONVERT: 'convert',
  REPLY_PUBLIC: 'reply-public',
  NOTE_INTERNAL: 'note-internal',
} as const;

export type TicketAction = (typeof TICKET_ACTION)[keyof typeof TICKET_ACTION];

export interface TicketActionAvailability {
  action: TicketAction;
  enabled: boolean;
  reason?: string;
}

export interface TicketHistoryEntry {
  id: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  changedBy: UserRef;
  note: string | null;
  createdAt: string;
}

export interface LinkedTaskSummary extends TaskRef {
  status: TaskStatus;
  assignedTo: UserRef | null;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  impact: string | null;
  resolution: string | null;
  history: TicketHistoryEntry[];
  /** Client-visible replies (always) plus internal notes when the caller may read them. */
  comments: CommentSummary[];
  linkedTasks: LinkedTaskSummary[];
  files: FileSummary[];
  actions: TicketActionAvailability[];
}
