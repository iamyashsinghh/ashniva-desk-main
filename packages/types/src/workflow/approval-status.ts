/**
 * Client-approval workflow (distinct from the Theme Manager's publishing approvals):
 * Draft → Internal review → Published to client → Client approved,
 * with Changes requested, Rejected and Withdrawn as side exits.
 */
export const APPROVAL_STATUS = {
  DRAFT: 'DRAFT',
  INTERNAL_REVIEW: 'INTERNAL_REVIEW',
  PUBLISHED: 'PUBLISHED',
  CLIENT_APPROVED: 'CLIENT_APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: 'Draft',
  INTERNAL_REVIEW: 'Internal review',
  PUBLISHED: 'Published to client',
  CLIENT_APPROVED: 'Client approved',
  CHANGES_REQUESTED: 'Changes requested',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export const APPROVAL_TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  DRAFT: ['INTERNAL_REVIEW', 'WITHDRAWN'],
  INTERNAL_REVIEW: ['PUBLISHED', 'DRAFT', 'WITHDRAWN'],
  PUBLISHED: ['CLIENT_APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'WITHDRAWN'],
  CLIENT_APPROVED: [],
  CHANGES_REQUESTED: ['DRAFT', 'INTERNAL_REVIEW', 'WITHDRAWN'],
  REJECTED: ['DRAFT', 'WITHDRAWN'],
  WITHDRAWN: ['DRAFT'],
};

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}

/** Statuses the client portal shows (drafts and internal review never leave the provider). */
export const CLIENT_VISIBLE_APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'PUBLISHED',
  'CLIENT_APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
];

/** What an approval request is about. */
export const APPROVAL_SUBJECT_TYPE = {
  CLIENT_UPDATE: 'CLIENT_UPDATE',
  MILESTONE: 'MILESTONE',
  CONTRACT_DOCUMENT: 'CONTRACT_DOCUMENT',
  CHANGE_REQUEST: 'CHANGE_REQUEST',
  FILE: 'FILE',
} as const;

export type ApprovalSubjectType =
  (typeof APPROVAL_SUBJECT_TYPE)[keyof typeof APPROVAL_SUBJECT_TYPE];

export const APPROVAL_SUBJECT_TYPE_LABELS: Record<ApprovalSubjectType, string> = {
  CLIENT_UPDATE: 'Work update',
  MILESTONE: 'Milestone / deliverable',
  CONTRACT_DOCUMENT: 'Contract document',
  CHANGE_REQUEST: 'Change request',
  FILE: 'File',
};
