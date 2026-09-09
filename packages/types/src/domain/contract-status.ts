export const CONTRACT_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  ARCHIVED: 'Archived',
};

/** How included hours reset over the life of a contract. */
export const BILLING_PERIOD = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
  WHOLE_TERM: 'WHOLE_TERM',
} as const;

export type BillingPeriod = (typeof BILLING_PERIOD)[keyof typeof BILLING_PERIOD];

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  YEARLY: 'Yearly',
  WHOLE_TERM: 'Whole contract term',
};

/** What happens to unused included hours when a billing period ends. */
export const CARRY_FORWARD_RULE = {
  NONE: 'NONE',
  FULL: 'FULL',
  CAPPED: 'CAPPED',
} as const;

export type CarryForwardRule = (typeof CARRY_FORWARD_RULE)[keyof typeof CARRY_FORWARD_RULE];

export const CARRY_FORWARD_RULE_LABELS: Record<CarryForwardRule, string> = {
  NONE: 'Unused hours expire',
  FULL: 'Carry every unused hour forward',
  CAPPED: 'Carry forward up to a cap',
};

/** Every movement on a contract's hour ledger. Minutes are signed: credits +, debits −. */
export const HOUR_LEDGER_KIND = {
  INCLUDED: 'INCLUDED',
  PURCHASED: 'PURCHASED',
  CARRY_FORWARD: 'CARRY_FORWARD',
  EXPIRED: 'EXPIRED',
  CONSUMED: 'CONSUMED',
  RESERVED: 'RESERVED',
  RELEASED: 'RELEASED',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;

export type HourLedgerKind = (typeof HOUR_LEDGER_KIND)[keyof typeof HOUR_LEDGER_KIND];

export const HOUR_LEDGER_KIND_LABELS: Record<HourLedgerKind, string> = {
  INCLUDED: 'Included hours',
  PURCHASED: 'Purchased hours',
  CARRY_FORWARD: 'Carried forward',
  EXPIRED: 'Expired at period end',
  CONSUMED: 'Used by approved work',
  RESERVED: 'Reserved',
  RELEASED: 'Reservation released',
  ADJUSTMENT: 'Manual adjustment',
};

export const PAYMENT_MILESTONE_STATUS = {
  PENDING: 'PENDING',
  INVOICED: 'INVOICED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentMilestoneStatus =
  (typeof PAYMENT_MILESTONE_STATUS)[keyof typeof PAYMENT_MILESTONE_STATUS];

export const PAYMENT_MILESTONE_STATUS_LABELS: Record<PaymentMilestoneStatus, string> = {
  PENDING: 'Pending',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

/** Days before the end date from which a contract counts as "expiring soon". */
export const CONTRACT_EXPIRY_WARNING_DAYS = 30;
