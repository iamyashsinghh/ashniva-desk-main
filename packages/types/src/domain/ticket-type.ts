export const TICKET_TYPE = {
  BUG: 'BUG',
  OUTAGE: 'OUTAGE',
  PERFORMANCE: 'PERFORMANCE',
  SUPPORT: 'SUPPORT',
  CHANGE_REQUEST: 'CHANGE_REQUEST',
  FEATURE: 'FEATURE',
  TRAINING: 'TRAINING',
  ACCESS: 'ACCESS',
  BILLING: 'BILLING',
  OTHER: 'OTHER',
} as const;

export type TicketType = (typeof TICKET_TYPE)[keyof typeof TICKET_TYPE];

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  BUG: 'Bug',
  OUTAGE: 'Outage',
  PERFORMANCE: 'Performance problem',
  SUPPORT: 'Support request',
  CHANGE_REQUEST: 'Change request',
  FEATURE: 'New feature',
  TRAINING: 'Training',
  ACCESS: 'Access issue',
  BILLING: 'Billing',
  OTHER: 'Other',
};

/**
 * Ticket types routed directly to the responsible / on-call developer by default.
 * Admin can change this list in Support routing settings (Architecture Plan §19.1).
 */
export const DEFAULT_DIRECT_TO_DEVELOPER_TICKET_TYPES: readonly TicketType[] = [
  TICKET_TYPE.BUG,
  TICKET_TYPE.OUTAGE,
  TICKET_TYPE.PERFORMANCE,
  TICKET_TYPE.ACCESS,
];
