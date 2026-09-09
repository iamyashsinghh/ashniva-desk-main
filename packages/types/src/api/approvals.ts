import type { ApprovalStatus, ApprovalSubjectType } from '../workflow/approval-status';
import type { OrganizationRef, UserRef } from './identity';
import type { FileSummary, ProjectRef } from './work';

export interface ApprovalHistoryEntry {
  id: string;
  fromStatus: ApprovalStatus | null;
  toStatus: ApprovalStatus;
  comment: string | null;
  actor: UserRef;
  /** Whether the actor acted for the provider or for the client. */
  side: 'INTERNAL' | 'CLIENT';
  createdAt: string;
}

export interface ApprovalSubjectRef {
  type: ApprovalSubjectType;
  id: string;
  /** Human label: task key, milestone name, document name, CR number. */
  label: string;
  /** Route in the app the subject can be opened at (internal or portal, by audience). */
  link: string | null;
}

export interface ApprovalSummary {
  id: string;
  title: string;
  status: ApprovalStatus;
  subject: ApprovalSubjectRef;
  clientOrganization: OrganizationRef;
  project: ProjectRef | null;
  contract: { id: string; number: string; title: string } | null;
  requestedBy: UserRef;
  publishedAt: string | null;
  dueDate: string | null;
  decidedBy: UserRef | null;
  decidedAt: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export const APPROVAL_ACTION = {
  SEND_TO_INTERNAL_REVIEW: 'send-to-internal-review',
  RETURN_TO_DRAFT: 'return-to-draft',
  PUBLISH: 'publish',
  APPROVE: 'approve',
  REQUEST_CHANGES: 'request-changes',
  REJECT: 'reject',
  WITHDRAW: 'withdraw',
  EDIT: 'edit',
} as const;

export type ApprovalAction = (typeof APPROVAL_ACTION)[keyof typeof APPROVAL_ACTION];

export interface ApprovalActionAvailability {
  action: ApprovalAction;
  enabled: boolean;
  reason?: string;
}

export interface ApprovalDetail extends ApprovalSummary {
  /** Client-visible summary of what is being approved. */
  summary: string;
  /** Internal only. */
  internalNotes: string | null;
  internalReviewer: UserRef | null;
  internalReviewedAt: string | null;
  publishedBy: UserRef | null;
  decisionComment: string | null;
  files: FileSummary[];
  history: ApprovalHistoryEntry[];
  actions: ApprovalActionAvailability[];
}

export const APPROVAL_LIST_VIEW = {
  INBOX: 'inbox',
  MINE: 'mine',
  WAITING_CLIENT: 'waiting-client',
  DECIDED: 'decided',
  ALL: 'all',
} as const;

export type ApprovalListView = (typeof APPROVAL_LIST_VIEW)[keyof typeof APPROVAL_LIST_VIEW];

/** Portal projection: published requests of the client's organization only. */
export interface PortalApprovalSummary {
  id: string;
  title: string;
  status: ApprovalStatus;
  subject: ApprovalSubjectRef;
  project: ProjectRef | null;
  publishedAt: string | null;
  dueDate: string | null;
  decidedBy: UserRef | null;
  decidedAt: string | null;
  isOverdue: boolean;
}

export interface PortalApprovalDetail extends PortalApprovalSummary {
  summary: string;
  decisionComment: string | null;
  files: FileSummary[];
  history: ApprovalHistoryEntry[];
  canDecide: boolean;
}
