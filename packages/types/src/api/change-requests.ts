import type { ChangeRequestStatus } from '../workflow/change-request-status';
import type { OrganizationRef, UserRef } from './identity';
import type { MilestoneRef } from './milestones';
import type { CommentSummary, FileSummary, ProjectRef, TaskRef } from './work';

export interface ChangeRequestRef {
  id: string;
  /** "CR-0012" */
  number: string;
  title: string;
}

export interface ChangeRequestHistoryEntry {
  id: string;
  fromStatus: ChangeRequestStatus | null;
  toStatus: ChangeRequestStatus;
  note: string | null;
  changedBy: UserRef;
  createdAt: string;
}

export interface ChangeRequestSummary extends ChangeRequestRef {
  status: ChangeRequestStatus;
  clientOrganization: OrganizationRef;
  project: ProjectRef | null;
  contract: { id: string; number: string; title: string } | null;
  requestedBy: UserRef;
  estimatedMinutes: number | null;
  costImpact: string | null;
  currency: string;
  timelineImpactDays: number | null;
  scheduledFor: string | null;
  submittedAt: string | null;
  linkedTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export const CHANGE_REQUEST_ACTION = {
  SUBMIT: 'submit',
  START_INTERNAL_REVIEW: 'start-internal-review',
  SEND_TO_CLIENT: 'send-to-client',
  APPROVE: 'approve',
  REQUEST_CHANGES: 'request-changes',
  REJECT: 'reject',
  SCHEDULE: 'schedule',
  COMPLETE: 'complete',
  CANCEL: 'cancel',
  REOPEN_DRAFT: 'reopen-draft',
  EDIT: 'edit',
  GENERATE_TASKS: 'generate-tasks',
} as const;

export type ChangeRequestAction =
  (typeof CHANGE_REQUEST_ACTION)[keyof typeof CHANGE_REQUEST_ACTION];

export interface ChangeRequestActionAvailability {
  action: ChangeRequestAction;
  enabled: boolean;
  reason?: string;
}

export interface ChangeRequestDetail extends ChangeRequestSummary {
  description: string;
  businessReason: string | null;
  scope: string | null;
  impact: string | null;
  /** Internal only. */
  internalNotes: string | null;
  decisionNote: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  /** Public (CLIENT) and internal comments for staff; public only for the portal. */
  comments: CommentSummary[];
  files: FileSummary[];
  linkedTasks: Array<TaskRef & { status: string }>;
  milestones: MilestoneRef[];
  history: ChangeRequestHistoryEntry[];
  actions: ChangeRequestActionAvailability[];
  createdBy: UserRef;
}

/** Client-portal projection: no internal notes, internal comments or costs beyond the impact. */
export interface PortalChangeRequestSummary extends ChangeRequestRef {
  status: ChangeRequestStatus;
  project: ProjectRef | null;
  requestedBy: UserRef;
  estimatedMinutes: number | null;
  costImpact: string | null;
  currency: string;
  timelineImpactDays: number | null;
  scheduledFor: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalChangeRequestDetail extends PortalChangeRequestSummary {
  description: string;
  businessReason: string | null;
  scope: string | null;
  impact: string | null;
  decisionNote: string | null;
  comments: CommentSummary[];
  files: FileSummary[];
  history: ChangeRequestHistoryEntry[];
  canApprove: boolean;
  canRequestChanges: boolean;
  canReply: boolean;
}
