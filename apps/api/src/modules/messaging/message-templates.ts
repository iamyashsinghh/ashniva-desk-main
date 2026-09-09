import { MESSAGE_TEMPLATE_LABELS, type MessageTemplate } from '@ashniva/types';

/**
 * Rendering a transactional message.
 *
 * Deliberately plain. The body carries a one-line summary and a deep link, never the content of
 * the thing itself: an email is not a secure channel, and the recipient has to sign in to see
 * anything that matters anyway. Nothing here ever renders a password, a token or a credential —
 * there is no field on `TemplateContext` that could hold one.
 */

export interface TemplateContext {
  /** The person being written to. */
  recipientName: string;
  organizationName: string;
  /** One line: "Priya assigned you ACME-214". */
  title: string;
  /** An optional second line of detail. Already free of internal-only wording by the caller. */
  body?: string | null;
  /** Absolute URL into the app. */
  link?: string | null;
}

export interface RenderedMessage {
  subject: string;
  text: string;
  html: string;
}

/** The call to action per template, so the mail says what to do rather than just what happened. */
const ACTIONS: Record<MessageTemplate, string> = {
  TASK_ASSIGNED: 'Open the task',
  REVIEW_REQUESTED: 'Review the work',
  REVIEW_REJECTED: 'Open the task',
  TICKET_CREATED: 'Open the ticket',
  TICKET_REPLY: 'Read the reply',
  SLA_AT_RISK: 'Open the ticket',
  CLIENT_APPROVAL_REQUESTED: 'Review and approve',
  CONTRACT_EXPIRING: 'Open the contract',
  INVOICE_ISSUED: 'View the invoice',
  RELEASE_NOTE_PUBLISHED: 'Read the release note',
  TEST: 'Open Ashniva Desk',
};

export function renderMessage(
  template: MessageTemplate,
  context: TemplateContext,
): RenderedMessage {
  const subject =
    template === 'TEST'
      ? `${context.organizationName}: email is working`
      : `${context.title} — ${context.organizationName}`;

  const lines = [
    `Hello ${context.recipientName},`,
    '',
    context.title,
    ...(context.body ? ['', context.body] : []),
    ...(context.link ? ['', `${ACTIONS[template]}: ${context.link}`] : []),
    '',
    `You received this because of activity on your ${context.organizationName} account.`,
    'Change which of these you receive in Notification preferences.',
  ];

  return {
    subject,
    text: lines.join('\n'),
    html: renderHtml(template, context),
  };
}

function renderHtml(template: MessageTemplate, context: TemplateContext): string {
  const button = context.link
    ? `<p style="margin:24px 0"><a href="${escapeHtml(context.link)}" ` +
      `style="background:#1f6feb;border-radius:6px;color:#ffffff;display:inline-block;` +
      `font-weight:600;padding:10px 18px;text-decoration:none">` +
      `${escapeHtml(ACTIONS[template])}</a></p>`
    : '';

  return [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;',
    'line-height:1.5;color:#1f2328;max-width:560px">',
    `<p>Hello ${escapeHtml(context.recipientName)},</p>`,
    `<p><strong>${escapeHtml(context.title)}</strong></p>`,
    context.body ? `<p>${escapeHtml(context.body)}</p>` : '',
    button,
    '<hr style="border:none;border-top:1px solid #d8dee4;margin:24px 0">',
    '<p style="color:#59636e;font-size:13px">',
    `You received this because of activity on your ${escapeHtml(context.organizationName)} `,
    'account. Change which of these you receive in Notification preferences.',
    '</p></div>',
  ].join('');
}

/**
 * Escapes text before it goes into the HTML body.
 *
 * Every value in the context comes from user-entered data — a task title, a ticket subject — so
 * none of it can be trusted to be markup-safe.
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function templateLabel(template: MessageTemplate): string {
  return MESSAGE_TEMPLATE_LABELS[template];
}
