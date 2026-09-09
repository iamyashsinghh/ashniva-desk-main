/** Every in-app notification the system can send. Preferences are stored per type and channel. */
export const NOTIFICATION_TYPE = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_DUE_SOON: 'TASK_DUE_SOON',
  TASK_OVERDUE: 'TASK_OVERDUE',
  TASK_REVIEW_REQUESTED: 'TASK_REVIEW_REQUESTED',
  TASK_REVIEW_REJECTED: 'TASK_REVIEW_REJECTED',
  /**
   * Testing passed on work somebody is waiting on.
   *
   * Its own type rather than a reuse of TASK_REVIEW_REJECTED's trick on the failure side: "your
   * work came back" and "your work is clear" are opposite events, and a person who muted one of
   * them did not mean to mute the other.
   */
  QA_PASSED: 'QA_PASSED',
  TICKET_NEW: 'TICKET_NEW',
  TICKET_REPLY: 'TICKET_REPLY',
  SLA_WARNING: 'SLA_WARNING',
  SLA_BREACH: 'SLA_BREACH',
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVAL_DECIDED: 'APPROVAL_DECIDED',
  CONTRACT_RENEWAL: 'CONTRACT_RENEWAL',
  CONTRACT_EXPIRY: 'CONTRACT_EXPIRY',
  SUPPORT_HOURS_LOW: 'SUPPORT_HOURS_LOW',
  CHANGE_REQUEST_STATUS: 'CHANGE_REQUEST_STATUS',
  // Support routing (package 8b)
  TICKET_AUTO_ASSIGNED: 'TICKET_AUTO_ASSIGNED',
  TICKET_ACK_OVERDUE: 'TICKET_ACK_OVERDUE',
  TICKET_REASSIGNED: 'TICKET_REASSIGNED',
  TICKET_ESCALATED: 'TICKET_ESCALATED',
  TICKET_UNROUTABLE: 'TICKET_UNROUTABLE',
  // IVR support calls (package 9)
  SUPPORT_CALL_INCOMING: 'SUPPORT_CALL_INCOMING',
  SUPPORT_CALL_MISSED: 'SUPPORT_CALL_MISSED',
  // Internal project communication (package 9b)
  CONVERSATION_MESSAGE: 'CONVERSATION_MESSAGE',
  CONVERSATION_MENTION: 'CONVERSATION_MENTION',
  // Recurring issues (package 11)
  /**
   * Enough separate clients have reported the same fault for it to be a fault in the product.
   *
   * Its own type rather than a reuse of the routing ones: this is not about a ticket needing an
   * owner, and somebody who has switched off routing chatter still wants to be told that three
   * different clients are hitting the same thing.
   */
  PROBLEM_THRESHOLD_REACHED: 'PROBLEM_THRESHOLD_REACHED',
  // Client UAT (phase 4)
  /**
   * The client answered a sign-off request.
   *
   * Its own type rather than a reuse of APPROVAL_DECIDED, which is the internal release
   * approvers': this is the *client* answering, it is the thing the UAT release gate waits on, and
   * a "request changes" is work landing back on somebody's desk. Until this existed a client could
   * approve or reject and nobody was told — the provider found out by opening the release page.
   */
  UAT_DECIDED: 'UAT_DECIDED',
  /**
   * The reporter's ticket was marked a duplicate and is being tracked on another one.
   *
   * Its own type rather than a reuse of TICKET_REPLY: nobody replied, and the thing that happened
   * is that their ticket stopped being the one that moves. Somebody who muted reply chatter still
   * needs to be told that the ticket they are watching is no longer where the work is. The body
   * only names the other ticket when the reader could open it — see `duplicateCloseNote`.
   */
  TICKET_DUPLICATE: 'TICKET_DUPLICATE',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];

export const ALL_NOTIFICATION_TYPES: readonly NotificationType[] = Object.values(NOTIFICATION_TYPE);

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  TASK_ASSIGNED: 'New task assigned to me',
  TASK_DUE_SOON: 'Task due-date reminder',
  TASK_OVERDUE: 'Task overdue',
  TASK_REVIEW_REQUESTED: 'Review requested',
  TASK_REVIEW_REJECTED: 'Review returned my work',
  QA_PASSED: 'Testing passed on my work',
  TICKET_NEW: 'New ticket',
  TICKET_REPLY: 'Reply on a ticket',
  SLA_WARNING: 'SLA at risk',
  SLA_BREACH: 'SLA breached',
  APPROVAL_REQUESTED: 'Approval requested',
  APPROVAL_DECIDED: 'Approval decided',
  CONTRACT_RENEWAL: 'Contract renewal due',
  CONTRACT_EXPIRY: 'Contract expiring',
  SUPPORT_HOURS_LOW: 'Support hours running low',
  CHANGE_REQUEST_STATUS: 'Change-request status changed',
  TICKET_AUTO_ASSIGNED: 'A ticket was routed to me',
  TICKET_ACK_OVERDUE: 'A ticket I was given needs acknowledging',
  TICKET_REASSIGNED: 'A ticket was reassigned',
  TICKET_ESCALATED: 'A ticket escalated to me',
  TICKET_UNROUTABLE: 'A ticket found nobody to route to',
  SUPPORT_CALL_INCOMING: 'A call is being connected to me',
  SUPPORT_CALL_MISSED: 'A call reached nobody',
  CONVERSATION_MESSAGE: 'A message in a conversation I am part of',
  CONVERSATION_MENTION: 'Somebody mentioned me in a conversation',
  PROBLEM_THRESHOLD_REACHED: 'Several clients reported the same fault',
  UAT_DECIDED: 'A client answered a sign-off request',
  TICKET_DUPLICATE: 'My ticket was marked a duplicate',
};

/** Types grouped for the preferences screen. */
export const NOTIFICATION_TYPE_GROUPS: ReadonlyArray<{
  label: string;
  types: readonly NotificationType[];
}> = [
  {
    label: 'Tasks',
    types: [
      'TASK_ASSIGNED',
      'TASK_DUE_SOON',
      'TASK_OVERDUE',
      'TASK_REVIEW_REQUESTED',
      'TASK_REVIEW_REJECTED',
      'QA_PASSED',
    ],
  },
  {
    label: 'Tickets and SLA',
    types: ['TICKET_NEW', 'TICKET_REPLY', 'TICKET_DUPLICATE', 'SLA_WARNING', 'SLA_BREACH'],
  },
  {
    label: 'Support routing',
    types: [
      'TICKET_AUTO_ASSIGNED',
      'TICKET_ACK_OVERDUE',
      'TICKET_REASSIGNED',
      'TICKET_ESCALATED',
      'TICKET_UNROUTABLE',
      'SUPPORT_CALL_INCOMING',
      'SUPPORT_CALL_MISSED',
      'PROBLEM_THRESHOLD_REACHED',
    ],
  },
  {
    label: 'Internal communication',
    types: ['CONVERSATION_MESSAGE', 'CONVERSATION_MENTION'],
  },
  {
    label: 'Approvals and change requests',
    types: ['APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'CHANGE_REQUEST_STATUS', 'UAT_DECIDED'],
  },
  { label: 'Contracts', types: ['CONTRACT_RENEWAL', 'CONTRACT_EXPIRY', 'SUPPORT_HOURS_LOW'] },
];

export const NOTIFICATION_CHANNEL = {
  IN_APP: 'IN_APP',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
} as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'In app',
  // Named for what they are rather than for the phase that was going to deliver them: the
  // adapters exist, but no deployment sends on either channel and switching one on is a decision
  // that has not been made.
  EMAIL: 'Email (not available yet)',
  WHATSAPP: 'WhatsApp (not available yet)',
};

/**
 * Channels a person can switch on today.
 *
 * In-app only. Email and WhatsApp have working adapters behind them, so the day this list grows
 * is the day real mail starts reaching real people — which is why it is one list, in one place,
 * rather than a condition spread over two apps.
 */
export const ACTIVE_NOTIFICATION_CHANNELS: readonly NotificationChannel[] = ['IN_APP'];

/** Urgent types that ignore quiet hours and rate limits. */
export const URGENT_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'SLA_BREACH',
  // A ticket with nobody to route it to is the one failure that strands a client's problem with
  // no owner. It reaches somebody at once, quiet hours or not.
  'TICKET_UNROUTABLE',
  'TICKET_ESCALATED',
  // A telephone is ringing right now, and a call nobody answered strands somebody who picked up
  // the phone rather than typing. Neither can wait for quiet hours to end.
  'SUPPORT_CALL_INCOMING',
  'SUPPORT_CALL_MISSED',
];
