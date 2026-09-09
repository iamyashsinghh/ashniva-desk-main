export const RELEASE_STATUS = {
  DRAFT: 'DRAFT',
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVED: 'APPROVED',
  /**
   * A time somebody wrote down, not a job that will run.
   *
   * Nothing publishes a scheduled release: `scheduledFor` is a note to the operator and to
   * everybody watching, and the release still goes out because a person presses Publish. That is
   * a deliberate gap rather than an oversight — an automatic publisher is a product decision, and
   * one that would need a great deal more than a timer to be safe. The label says so, so nobody
   * goes home expecting a deployment.
   */
  SCHEDULED: 'SCHEDULED',
  PUBLISHING: 'PUBLISHING',
  PUBLISHED: 'PUBLISHED',
  VERIFIED: 'VERIFIED',
  ROLLED_BACK: 'ROLLED_BACK',
  FAILED: 'FAILED',
} as const;

export type ReleaseStatus = (typeof RELEASE_STATUS)[keyof typeof RELEASE_STATUS];

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  DRAFT: 'Draft',
  APPROVAL_REQUESTED: 'Approval requested',
  APPROVED: 'Approved',
  // "Planned", not "Scheduled": a scheduled release waits for a person, and a label that sounds
  // like a cron job is the one somebody trusts on a Friday evening.
  SCHEDULED: 'Planned for a time',
  PUBLISHING: 'Publishing',
  PUBLISHED: 'Published',
  VERIFIED: 'Verified live',
  ROLLED_BACK: 'Rolled back',
  FAILED: 'Failed',
};

/** Who may approve a release; configured per project (project_release_policy.approvers). */
export const RELEASE_APPROVER_ROLE = {
  SENIOR: 'SENIOR',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  QA_LEAD: 'QA_LEAD',
  CLIENT: 'CLIENT',
  DIRECTOR: 'DIRECTOR',
} as const;

export type ReleaseApproverRole =
  (typeof RELEASE_APPROVER_ROLE)[keyof typeof RELEASE_APPROVER_ROLE];
