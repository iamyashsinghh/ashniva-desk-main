/**
 * Change-request workflow:
 * Draft → Submitted → Internal review → Client review → Approved → Scheduled → Completed,
 * with Rejected, Changes requested and Cancelled as side exits.
 */
export const CHANGE_REQUEST_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  INTERNAL_REVIEW: 'INTERNAL_REVIEW',
  CLIENT_REVIEW: 'CLIENT_REVIEW',
  APPROVED: 'APPROVED',
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  CANCELLED: 'CANCELLED',
} as const;

export type ChangeRequestStatus =
  (typeof CHANGE_REQUEST_STATUS)[keyof typeof CHANGE_REQUEST_STATUS];

export const CHANGE_REQUEST_STATUS_LABELS: Record<ChangeRequestStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  INTERNAL_REVIEW: 'Internal review',
  CLIENT_REVIEW: 'Client review',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
  CANCELLED: 'Cancelled',
};

export const CHANGE_REQUEST_TRANSITIONS: Record<
  ChangeRequestStatus,
  readonly ChangeRequestStatus[]
> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['INTERNAL_REVIEW', 'CANCELLED'],
  INTERNAL_REVIEW: ['CLIENT_REVIEW', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'],
  CLIENT_REVIEW: ['APPROVED', 'CHANGES_REQUESTED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: ['DRAFT'],
  CHANGES_REQUESTED: ['DRAFT', 'SUBMITTED', 'CANCELLED'],
  CANCELLED: [],
};

export function canTransitionChangeRequest(
  from: ChangeRequestStatus,
  to: ChangeRequestStatus,
): boolean {
  return CHANGE_REQUEST_TRANSITIONS[from].includes(to);
}

export const OPEN_CHANGE_REQUEST_STATUSES: readonly ChangeRequestStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'INTERNAL_REVIEW',
  'CLIENT_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'CHANGES_REQUESTED',
];

/** Statuses a client may see: internal review is shown as "under review", drafts are hidden. */
export const CLIENT_VISIBLE_CHANGE_REQUEST_STATUSES: readonly ChangeRequestStatus[] = [
  'SUBMITTED',
  'INTERNAL_REVIEW',
  'CLIENT_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'COMPLETED',
  'REJECTED',
  'CHANGES_REQUESTED',
  'CANCELLED',
];
