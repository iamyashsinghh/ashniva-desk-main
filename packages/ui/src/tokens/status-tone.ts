import {
  AI_SUMMARY_STATUS,
  APPROVAL_STATUS,
  AVAILABILITY_STATUS,
  CHANGE_REQUEST_STATUS,
  CLIENT_VISIBLE_STATUS,
  CONTRACT_STATUS,
  MILESTONE_STATUS,
  PAYMENT_MILESTONE_STATUS,
  INVOICE_STATUS,
  RELEASE_NOTE_STATUS,
  SLA_TARGET_STATUS,
  TASK_STATUS,
  TICKET_STATUS,
  type AiSummaryStatus,
  type ApprovalStatus,
  type AvailabilityStatus,
  type ChangeRequestStatus,
  type ClientVisibleStatus,
  type ContractStatus,
  type MilestoneStatus,
  type PaymentMilestoneStatus,
  type InvoiceStatus,
  type ReleaseNoteStatus,
  type SlaTargetStatus,
  type TaskStatus,
  type TicketStatus,
} from '@ashniva/types';

/** A tone is a background/foreground colour pair defined in tokens.css (--tone-*-bg / -fg). */
export type Tone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'review' | 'danger';

export const TASK_STATUS_TONES: Record<TaskStatus, Tone> = {
  [TASK_STATUS.DRAFT]: 'neutral',
  [TASK_STATUS.ASSIGNED]: 'info',
  [TASK_STATUS.IN_PROGRESS]: 'progress',
  [TASK_STATUS.IN_REVIEW]: 'warning',
  [TASK_STATUS.REOPENED]: 'warning',
  [TASK_STATUS.DEV_COMPLETED]: 'progress',
  [TASK_STATUS.CODE_REVIEW]: 'warning',
  [TASK_STATUS.READY_FOR_QA]: 'warning',
  [TASK_STATUS.TESTING_STAGING]: 'warning',
  [TASK_STATUS.QA_PASSED]: 'success',
  [TASK_STATUS.CLIENT_UAT]: 'review',
  [TASK_STATUS.READY_TO_PUBLISH]: 'success',
  [TASK_STATUS.PUBLISHED_LIVE]: 'review',
  [TASK_STATUS.LIVE_VERIFICATION]: 'review',
  [TASK_STATUS.COMPLETED]: 'success',
  [TASK_STATUS.QA_FAILED]: 'danger',
  [TASK_STATUS.RETURNED_TO_DEV]: 'danger',
  [TASK_STATUS.FIX_SUBMITTED]: 'warning',
  [TASK_STATUS.LIVE_FAILED]: 'danger',
  [TASK_STATUS.ROLLBACK_REQUIRED]: 'danger',
  [TASK_STATUS.BLOCKED]: 'danger',
  [TASK_STATUS.CANCELLED]: 'neutral',
};

export const TICKET_STATUS_TONES: Record<TicketStatus, Tone> = {
  [TICKET_STATUS.NEW]: 'neutral',
  [TICKET_STATUS.AUTO_ASSIGNED]: 'info',
  [TICKET_STATUS.ASSIGNED]: 'info',
  [TICKET_STATUS.ACKNOWLEDGED]: 'info',
  [TICKET_STATUS.IN_PROGRESS]: 'progress',
  [TICKET_STATUS.WAITING_CLIENT]: 'warning',
  [TICKET_STATUS.ESCALATED]: 'danger',
  [TICKET_STATUS.REVIEW]: 'warning',
  [TICKET_STATUS.RESOLVED]: 'success',
  [TICKET_STATUS.CLOSED]: 'neutral',
  [TICKET_STATUS.REOPENED]: 'danger',
  [TICKET_STATUS.CANCELLED]: 'neutral',
};

export const CLIENT_VISIBLE_STATUS_TONES: Record<ClientVisibleStatus, Tone> = {
  [CLIENT_VISIBLE_STATUS.RECEIVED]: 'neutral',
  [CLIENT_VISIBLE_STATUS.ASSIGNED]: 'info',
  [CLIENT_VISIBLE_STATUS.IN_DEVELOPMENT]: 'progress',
  [CLIENT_VISIBLE_STATUS.UNDER_TESTING]: 'warning',
  [CLIENT_VISIBLE_STATUS.AWAITING_YOUR_APPROVAL]: 'review',
  [CLIENT_VISIBLE_STATUS.SCHEDULED_FOR_RELEASE]: 'success',
  [CLIENT_VISIBLE_STATUS.PUBLISHED_LIVE]: 'review',
  [CLIENT_VISIBLE_STATUS.WAITING_FOR_YOU]: 'warning',
  [CLIENT_VISIBLE_STATUS.COMPLETED]: 'success',
  // Neutral, not success: nothing was delivered, so a green pill would say the opposite.
  [CLIENT_VISIBLE_STATUS.CLOSED]: 'neutral',
};

export const CONTRACT_STATUS_TONES: Record<ContractStatus, Tone> = {
  [CONTRACT_STATUS.DRAFT]: 'neutral',
  [CONTRACT_STATUS.ACTIVE]: 'success',
  [CONTRACT_STATUS.EXPIRED]: 'danger',
  [CONTRACT_STATUS.ARCHIVED]: 'neutral',
};

export const PAYMENT_MILESTONE_STATUS_TONES: Record<PaymentMilestoneStatus, Tone> = {
  [PAYMENT_MILESTONE_STATUS.PENDING]: 'neutral',
  [PAYMENT_MILESTONE_STATUS.INVOICED]: 'warning',
  [PAYMENT_MILESTONE_STATUS.PAID]: 'success',
  [PAYMENT_MILESTONE_STATUS.CANCELLED]: 'neutral',
};

export const MILESTONE_STATUS_TONES: Record<MilestoneStatus, Tone> = {
  [MILESTONE_STATUS.PLANNED]: 'neutral',
  [MILESTONE_STATUS.IN_PROGRESS]: 'progress',
  [MILESTONE_STATUS.ON_HOLD]: 'warning',
  [MILESTONE_STATUS.COMPLETED]: 'success',
  [MILESTONE_STATUS.CANCELLED]: 'neutral',
};

export const CHANGE_REQUEST_STATUS_TONES: Record<ChangeRequestStatus, Tone> = {
  [CHANGE_REQUEST_STATUS.DRAFT]: 'neutral',
  [CHANGE_REQUEST_STATUS.SUBMITTED]: 'info',
  [CHANGE_REQUEST_STATUS.INTERNAL_REVIEW]: 'warning',
  [CHANGE_REQUEST_STATUS.CLIENT_REVIEW]: 'review',
  [CHANGE_REQUEST_STATUS.APPROVED]: 'success',
  [CHANGE_REQUEST_STATUS.SCHEDULED]: 'progress',
  [CHANGE_REQUEST_STATUS.COMPLETED]: 'success',
  [CHANGE_REQUEST_STATUS.REJECTED]: 'danger',
  [CHANGE_REQUEST_STATUS.CHANGES_REQUESTED]: 'warning',
  [CHANGE_REQUEST_STATUS.CANCELLED]: 'neutral',
};

export const APPROVAL_STATUS_TONES: Record<ApprovalStatus, Tone> = {
  [APPROVAL_STATUS.DRAFT]: 'neutral',
  [APPROVAL_STATUS.INTERNAL_REVIEW]: 'warning',
  [APPROVAL_STATUS.PUBLISHED]: 'review',
  [APPROVAL_STATUS.CLIENT_APPROVED]: 'success',
  [APPROVAL_STATUS.CHANGES_REQUESTED]: 'warning',
  [APPROVAL_STATUS.REJECTED]: 'danger',
  [APPROVAL_STATUS.WITHDRAWN]: 'neutral',
};

export const SLA_STATUS_TONES: Record<SlaTargetStatus, Tone> = {
  [SLA_TARGET_STATUS.NONE]: 'neutral',
  [SLA_TARGET_STATUS.ON_TRACK]: 'success',
  [SLA_TARGET_STATUS.AT_RISK]: 'warning',
  [SLA_TARGET_STATUS.BREACHED]: 'danger',
  [SLA_TARGET_STATUS.PAUSED]: 'info',
  [SLA_TARGET_STATUS.MET]: 'success',
  [SLA_TARGET_STATUS.MET_LATE]: 'warning',
};

export const RELEASE_NOTE_STATUS_TONES: Record<ReleaseNoteStatus, Tone> = {
  [RELEASE_NOTE_STATUS.DRAFT]: 'neutral',
  [RELEASE_NOTE_STATUS.IN_REVIEW]: 'warning',
  [RELEASE_NOTE_STATUS.CHANGES_REQUESTED]: 'warning',
  [RELEASE_NOTE_STATUS.APPROVED]: 'success',
  // Published is the state a client can see, so it reads as an outward step, not just "done".
  [RELEASE_NOTE_STATUS.PUBLISHED]: 'review',
  [RELEASE_NOTE_STATUS.CANCELLED]: 'neutral',
};

export const INVOICE_STATUS_TONES: Record<InvoiceStatus, Tone> = {
  [INVOICE_STATUS.DRAFT]: 'neutral',
  [INVOICE_STATUS.ISSUED]: 'info',
  [INVOICE_STATUS.PARTIALLY_PAID]: 'progress',
  [INVOICE_STATUS.PAID]: 'success',
  [INVOICE_STATUS.OVERDUE]: 'danger',
  [INVOICE_STATUS.CANCELLED]: 'neutral',
  // Void is not neutral: the document existed and was withdrawn, which matters when reading a
  // list of numbers that has no gaps.
  [INVOICE_STATUS.VOID]: 'warning',
};

export const AI_SUMMARY_STATUS_TONES: Record<AiSummaryStatus, Tone> = {
  [AI_SUMMARY_STATUS.DRAFT]: 'neutral',
  [AI_SUMMARY_STATUS.GENERATING]: 'progress',
  [AI_SUMMARY_STATUS.GENERATION_FAILED]: 'danger',
  [AI_SUMMARY_STATUS.IN_REVIEW]: 'warning',
  [AI_SUMMARY_STATUS.CHANGES_REQUESTED]: 'warning',
  [AI_SUMMARY_STATUS.APPROVED]: 'review',
  [AI_SUMMARY_STATUS.PUBLISHED]: 'success',
  [AI_SUMMARY_STATUS.CANCELLED]: 'neutral',
};

/**
 * Whether somebody can be routed work right now.
 *
 * `OUT_OF_HOURS` is neutral rather than a warning: being off shift is the normal state of most
 * people most of the time, and colouring it as a problem would make a correct rota look broken.
 * Being at the workload limit is a warning, because it is the one a manager can act on.
 */
export const AVAILABILITY_STATUS_TONES: Record<AvailabilityStatus, Tone> = {
  [AVAILABILITY_STATUS.AVAILABLE]: 'success',
  [AVAILABILITY_STATUS.ON_LEAVE]: 'info',
  [AVAILABILITY_STATUS.OUT_OF_HOURS]: 'neutral',
  [AVAILABILITY_STATUS.AT_LIMIT]: 'warning',
};
