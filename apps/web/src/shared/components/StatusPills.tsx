import {
  AI_SUMMARY_STATUS_LABELS,
  APPROVAL_STATUS_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  CLIENT_VISIBLE_STATUS_LABELS,
  CONTRACT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  MILESTONE_STATUS_LABELS,
  PAYMENT_MILESTONE_STATUS_LABELS,
  RELEASE_NOTE_STATUS_LABELS,
  SLA_TARGET_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TICKET_STATUS_LABELS,
  type AiSummaryStatus,
  type ApprovalStatus,
  type ChangeRequestStatus,
  type ClientVisibleStatus,
  type ContractStatus,
  type InvoiceStatus,
  type MilestoneStatus,
  type PaymentMilestoneStatus,
  type ReleaseNoteStatus,
  type SlaTargetStatus,
  type TaskStatus,
  type TicketStatus,
} from '@ashniva/types';
import {
  AI_SUMMARY_STATUS_TONES,
  APPROVAL_STATUS_TONES,
  CHANGE_REQUEST_STATUS_TONES,
  CLIENT_VISIBLE_STATUS_TONES,
  CONTRACT_STATUS_TONES,
  INVOICE_STATUS_TONES,
  MILESTONE_STATUS_TONES,
  PAYMENT_MILESTONE_STATUS_TONES,
  RELEASE_NOTE_STATUS_TONES,
  SLA_STATUS_TONES,
  StatusPill,
  TASK_STATUS_TONES,
  TICKET_STATUS_TONES,
} from '@ashniva/ui';

/** One place that turns a status into the right label + tone, so screens never hardcode them. */
export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <StatusPill tone={TASK_STATUS_TONES[status]} label={TASK_STATUS_LABELS[status]} />;
}

export function TicketStatusPill({ status }: { status: TicketStatus }) {
  return <StatusPill tone={TICKET_STATUS_TONES[status]} label={TICKET_STATUS_LABELS[status]} />;
}

export function ClientStatusPill({ status }: { status: ClientVisibleStatus }) {
  return (
    <StatusPill
      tone={CLIENT_VISIBLE_STATUS_TONES[status]}
      label={CLIENT_VISIBLE_STATUS_LABELS[status]}
    />
  );
}

export function ContractStatusPill({ status }: { status: ContractStatus }) {
  return <StatusPill tone={CONTRACT_STATUS_TONES[status]} label={CONTRACT_STATUS_LABELS[status]} />;
}

export function PaymentStatusPill({ status }: { status: PaymentMilestoneStatus }) {
  return (
    <StatusPill
      tone={PAYMENT_MILESTONE_STATUS_TONES[status]}
      label={PAYMENT_MILESTONE_STATUS_LABELS[status]}
    />
  );
}

export function MilestoneStatusPill({ status }: { status: MilestoneStatus }) {
  return (
    <StatusPill tone={MILESTONE_STATUS_TONES[status]} label={MILESTONE_STATUS_LABELS[status]} />
  );
}

export function ChangeRequestStatusPill({ status }: { status: ChangeRequestStatus }) {
  return (
    <StatusPill
      tone={CHANGE_REQUEST_STATUS_TONES[status]}
      label={CHANGE_REQUEST_STATUS_LABELS[status]}
    />
  );
}

export function ApprovalStatusPill({ status }: { status: ApprovalStatus }) {
  return <StatusPill tone={APPROVAL_STATUS_TONES[status]} label={APPROVAL_STATUS_LABELS[status]} />;
}

export function SlaStatusPill({ status, prefix }: { status: SlaTargetStatus; prefix?: string }) {
  const label = prefix
    ? `${prefix}: ${SLA_TARGET_STATUS_LABELS[status]}`
    : SLA_TARGET_STATUS_LABELS[status];
  return <StatusPill tone={SLA_STATUS_TONES[status]} label={label} />;
}

export function ReleaseNoteStatusPill({ status }: { status: ReleaseNoteStatus }) {
  return (
    <StatusPill
      tone={RELEASE_NOTE_STATUS_TONES[status]}
      label={RELEASE_NOTE_STATUS_LABELS[status]}
    />
  );
}

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return <StatusPill tone={INVOICE_STATUS_TONES[status]} label={INVOICE_STATUS_LABELS[status]} />;
}

export function AiSummaryStatusPill({ status }: { status: AiSummaryStatus }) {
  return (
    <StatusPill tone={AI_SUMMARY_STATUS_TONES[status]} label={AI_SUMMARY_STATUS_LABELS[status]} />
  );
}
