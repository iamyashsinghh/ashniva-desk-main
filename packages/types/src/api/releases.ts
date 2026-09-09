import type { ReleaseApproverRole, ReleaseStatus } from '../workflow/release-status';
import type { TestEnvironment } from '../workflow/qa-status';

/**
 * Releases: what is going out, who has to agree, and what must be true first.
 *
 * The readiness checklist is computed on the server and sent whole, because the Publish button is
 * only ever as trustworthy as the reasons behind it. A UI that decides for itself whether a
 * release is publishable is a UI that can be wrong in a way nobody notices until production.
 */

export const RELEASE_ITEM_KIND = {
  TASK: 'TASK',
  TICKET: 'TICKET',
  CHANGE_REQUEST: 'CHANGE_REQUEST',
} as const;

export type ReleaseItemKind = (typeof RELEASE_ITEM_KIND)[keyof typeof RELEASE_ITEM_KIND];

export const RELEASE_APPROVAL_DECISION = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type ReleaseApprovalDecision =
  (typeof RELEASE_APPROVAL_DECISION)[keyof typeof RELEASE_APPROVAL_DECISION];

export interface ReleaseSummary {
  id: string;
  projectId: string;
  projectName: string;
  version: string;
  title: string;
  status: ReleaseStatus;
  environment: TestEnvironment;
  itemCount: number;
  scheduledFor: string | null;
  publishedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseItemRow {
  id: string;
  kind: ReleaseItemKind;
  taskId: string | null;
  ticketId: string | null;
  changeRequestId: string | null;
  /** The number a person recognises, e.g. "ACM-142". */
  reference: string;
  title: string;
  position: number;
}

export interface ReleaseApprovalRow {
  id: string;
  approverRole: ReleaseApproverRole;
  decision: ReleaseApprovalDecision;
  approverUserId: string | null;
  approverName: string | null;
  note: string | null;
  decidedAt: string | null;
}

export interface ReleaseHistoryRow {
  id: string;
  fromStatus: ReleaseStatus | null;
  toStatus: ReleaseStatus;
  note: string | null;
  changedByName: string;
  createdAt: string;
}

/**
 * One gate, and whether it is satisfied.
 *
 * `reason` is filled in whether the gate passes or not, so the UI can explain a disabled Publish
 * button rather than merely disabling it.
 */
export interface ReleaseGate {
  key: 'approvals' | 'qa' | 'uat' | 'items' | 'publisher';
  satisfied: boolean;
  reason: string;
}

export interface ReleaseReadiness {
  publishable: boolean;
  /** Whether the operator will be asked to type the version back.  */
  requiresTypedConfirmation: boolean;
  gates: ReleaseGate[];
}

export interface ReleaseDetail extends ReleaseSummary {
  notes: string | null;
  publishedByName: string | null;
  rolledBackAt: string | null;
  rollbackReason: string | null;
  failureReason: string | null;
  releaseNoteId: string | null;
  items: ReleaseItemRow[];
  approvals: ReleaseApprovalRow[];
  history: ReleaseHistoryRow[];
  readiness: ReleaseReadiness;
}

export interface ProjectReleasePolicySummary {
  projectId: string;
  approverRoles: ReleaseApproverRole[];
  requiresQaPass: boolean;
  requiresClientUat: boolean;
  requiresLiveVerification: boolean;
  requiresTypedConfirmation: boolean;
}
