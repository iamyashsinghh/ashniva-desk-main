import type { NotificationType } from '../domain/notification-type';

// ---------------------------------------------------------------------------------------------
// Outbound messaging: email and WhatsApp
//
// Both channels share this vocabulary. The delivery lifecycle, the retry accounting and the
// idempotency rule are the same for each, and an administrator reads one history, not two.
// ---------------------------------------------------------------------------------------------

export const OUTBOUND_MESSAGE_STATUS = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type OutboundMessageStatus =
  (typeof OUTBOUND_MESSAGE_STATUS)[keyof typeof OUTBOUND_MESSAGE_STATUS];

export const OUTBOUND_MESSAGE_STATUS_LABELS: Record<OutboundMessageStatus, string> = {
  QUEUED: 'Queued',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
  SKIPPED: 'Not sent',
};

/** Statuses that will not change again without a new attempt. */
export const TERMINAL_OUTBOUND_STATUSES: readonly OutboundMessageStatus[] = [
  'SENT',
  'FAILED',
  'SKIPPED',
];

export const EMAIL_ENCRYPTION = {
  NONE: 'NONE',
  STARTTLS: 'STARTTLS',
  TLS: 'TLS',
} as const;

export type EmailEncryption = (typeof EMAIL_ENCRYPTION)[keyof typeof EMAIL_ENCRYPTION];

export const EMAIL_ENCRYPTION_LABELS: Record<EmailEncryption, string> = {
  NONE: 'None (not recommended)',
  STARTTLS: 'STARTTLS (usually port 587)',
  TLS: 'TLS / SSL (usually port 465)',
};

/**
 * The transactional messages the system sends.
 *
 * Every one of these is a reaction to something that happened on an account. There is no
 * campaign, list or broadcast template here, and adding one would need a different mechanism —
 * consent tracking and an unsubscribe path that transactional mail does not have.
 */
export const MESSAGE_TEMPLATE = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  REVIEW_REQUESTED: 'REVIEW_REQUESTED',
  REVIEW_REJECTED: 'REVIEW_REJECTED',
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_REPLY: 'TICKET_REPLY',
  SLA_AT_RISK: 'SLA_AT_RISK',
  CLIENT_APPROVAL_REQUESTED: 'CLIENT_APPROVAL_REQUESTED',
  CONTRACT_EXPIRING: 'CONTRACT_EXPIRING',
  INVOICE_ISSUED: 'INVOICE_ISSUED',
  RELEASE_NOTE_PUBLISHED: 'RELEASE_NOTE_PUBLISHED',
  /** Sent only by the "send a test" button on the settings screen. */
  TEST: 'TEST',
} as const;

export type MessageTemplate = (typeof MESSAGE_TEMPLATE)[keyof typeof MESSAGE_TEMPLATE];

export const MESSAGE_TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  TASK_ASSIGNED: 'Task assigned',
  REVIEW_REQUESTED: 'Review requested',
  REVIEW_REJECTED: 'Review rejected',
  TICKET_CREATED: 'Ticket created',
  TICKET_REPLY: 'Ticket reply',
  SLA_AT_RISK: 'SLA at risk',
  CLIENT_APPROVAL_REQUESTED: 'Client approval requested',
  CONTRACT_EXPIRING: 'Contract expiring',
  INVOICE_ISSUED: 'Invoice issued',
  RELEASE_NOTE_PUBLISHED: 'Release note published',
  TEST: 'Test message',
};

/**
 * Which notification type produces which template.
 *
 * A notification type that is not listed has no email or WhatsApp template, so it stays in-app
 * only — the mapping is the allow-list, not a default.
 */
export const NOTIFICATION_TEMPLATE_MAP: Partial<Record<NotificationType, MessageTemplate>> = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_REVIEW_REQUESTED: 'REVIEW_REQUESTED',
  TASK_REVIEW_REJECTED: 'REVIEW_REJECTED',
  TICKET_NEW: 'TICKET_CREATED',
  TICKET_REPLY: 'TICKET_REPLY',
  SLA_WARNING: 'SLA_AT_RISK',
  SLA_BREACH: 'SLA_AT_RISK',
  APPROVAL_REQUESTED: 'CLIENT_APPROVAL_REQUESTED',
  CONTRACT_EXPIRY: 'CONTRACT_EXPIRING',
  CONTRACT_RENEWAL: 'CONTRACT_EXPIRING',
  // Deliberately absent: TASK_DUE_SOON, TASK_OVERDUE, APPROVAL_DECIDED, SUPPORT_HOURS_LOW and
  // CHANGE_REQUEST_STATUS stay in-app. They fire often enough that mailing them would train
  // people to ignore the mail.
};

export function templateForNotification(type: NotificationType): MessageTemplate | null {
  return NOTIFICATION_TEMPLATE_MAP[type] ?? null;
}

/** Non-secret email settings. The password lives in the encrypted credential, never here. */
export interface EmailSettings {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
  replyTo: string | null;
  host: string;
  port: number;
  encryption: EmailEncryption;
  username: string | null;
  /** True when a password is stored. The password itself is never returned. */
  hasPassword: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/**
 * A row in the delivery history.
 *
 * `destination` is masked before it leaves the API: a delivery log is an operational record, not
 * a directory of everyone's address.
 */
export interface OutboundMessageSummary {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP';
  template: MessageTemplate;
  /** Masked, e.g. "p•••a@example.com" or "+44 ••• ••• 321". */
  destination: string;
  subject: string | null;
  status: OutboundMessageStatus;
  attempts: number;
  lastError: string | null;
  queuedAt: string;
  sentAt: string | null;
}

export interface ConnectionTestResult {
  ok: boolean;
  /** Redacted before it reaches this field; safe to show an administrator. */
  message: string;
}

/**
 * Non-secret WhatsApp settings.
 *
 * Two secrets exist for this channel and neither has a field here: the access token used to
 * send, and the app secret used to verify inbound webhooks. Both are reported as booleans only.
 */
export interface WhatsAppSettings {
  enabled: boolean;
  businessAccountId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  apiVersion: string;
  templateLanguage: string;
  /** Our template key to the name approved in the WhatsApp Business account. */
  templateNames: Partial<Record<MessageTemplate, string>>;
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  /** True once a verify token is stored, so the handshake can succeed. */
  hasVerifyToken: boolean;
  /** The URL to give Meta. Built by the API so it cannot be mistyped. */
  webhookUrl: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

/** Templates that need an approved WhatsApp template name before they can be sent. */
export const WHATSAPP_TEMPLATES: readonly MessageTemplate[] = [
  'TASK_ASSIGNED',
  'TICKET_REPLY',
  'SLA_AT_RISK',
  'CLIENT_APPROVAL_REQUESTED',
  'CONTRACT_EXPIRING',
  'INVOICE_ISSUED',
  'RELEASE_NOTE_PUBLISHED',
  'TEST',
];
