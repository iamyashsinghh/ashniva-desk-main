import {
  BILLING_PERIOD,
  CARRY_FORWARD_RULE,
  CONTRACT_STATUS,
  HOUR_LEDGER_KIND,
  type BillingPeriod,
  type CarryForwardRule,
  type ContractHourBalance,
  type HourLedgerKind,
} from '@ashniva/types';

/** Calendar-date helpers on UTC midnight dates (Prisma @db.Date values). */
export function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function addMonths(value: Date, months: number): Date {
  const day = value.getUTCDate();
  const target = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000);
}

export function toIsoDate(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

const MONTHS: Record<Exclude<BillingPeriod, 'WHOLE_TERM'>, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

export interface PeriodBounds {
  /** Inclusive first day. */
  start: Date;
  /** Inclusive last day. */
  end: Date;
}

/**
 * The billing period that contains `on`, anchored on the contract start date (anniversary
 * periods, e.g. a contract starting on the 15th runs 15th → 14th). WHOLE_TERM is one period
 * from start to end date (or ten years when open-ended).
 */
export function periodContaining(
  contract: { startDate: Date; endDate: Date | null; billingPeriod: BillingPeriod },
  on: Date,
): PeriodBounds {
  const start = dateOnly(contract.startDate);
  const day = dateOnly(on);
  if (contract.billingPeriod === BILLING_PERIOD.WHOLE_TERM) {
    const end = contract.endDate ? dateOnly(contract.endDate) : addDays(addMonths(start, 120), -1);
    return { start, end };
  }
  const months = MONTHS[contract.billingPeriod];
  let periodStart = start;
  let periodEnd = addDays(addMonths(periodStart, months), -1);
  // Walk forward until the period covers the day. Contracts are years, not centuries, so the
  // loop is short; it also tolerates dates before the start (first period).
  while (periodEnd < day) {
    periodStart = addMonths(periodStart, months);
    periodEnd = addDays(addMonths(periodStart, months), -1);
  }
  if (contract.endDate && periodEnd > dateOnly(contract.endDate)) {
    periodEnd = dateOnly(contract.endDate);
  }
  return { start: periodStart, end: periodEnd };
}

/** Unused minutes that move into the next period under the contract's rule. */
export function carryForwardMinutes(
  rule: CarryForwardRule,
  capMinutes: number | null,
  remaining: number,
): number {
  if (remaining <= 0 || rule === CARRY_FORWARD_RULE.NONE) {
    return 0;
  }
  if (rule === CARRY_FORWARD_RULE.CAPPED) {
    return Math.min(remaining, Math.max(0, capMinutes ?? 0));
  }
  return remaining;
}

export interface LedgerLike {
  kind: HourLedgerKind;
  minutes: number;
}

/** Sums a period's ledger rows into the balance shown to people. Pure, so it is unit-tested. */
export function computeBalance(
  rows: readonly LedgerLike[],
  period: { start: Date | null; end: Date | null },
  lowThresholdMinutes: number,
): ContractHourBalance {
  const sum = (kind: HourLedgerKind) =>
    rows.filter((row) => row.kind === kind).reduce((total, row) => total + row.minutes, 0);
  const included = sum(HOUR_LEDGER_KIND.INCLUDED);
  const purchased = sum(HOUR_LEDGER_KIND.PURCHASED);
  const carried = sum(HOUR_LEDGER_KIND.CARRY_FORWARD);
  const consumed = -sum(HOUR_LEDGER_KIND.CONSUMED);
  const reserved = -(sum(HOUR_LEDGER_KIND.RESERVED) + sum(HOUR_LEDGER_KIND.RELEASED));
  const adjustments = sum(HOUR_LEDGER_KIND.ADJUSTMENT);
  const expired = -sum(HOUR_LEDGER_KIND.EXPIRED);
  const remaining = included + purchased + carried + adjustments - consumed - reserved - expired;
  return {
    includedMinutes: included,
    purchasedMinutes: purchased,
    carriedForwardMinutes: carried,
    consumedMinutes: consumed,
    reservedMinutes: reserved,
    adjustmentMinutes: adjustments,
    expiredMinutes: expired,
    remainingMinutes: remaining,
    periodStart: toIsoDate(period.start),
    periodEnd: toIsoDate(period.end),
    isLow: remaining <= lowThresholdMinutes,
  };
}

/** Whether a contract keeps an hour ledger at all. */
export function tracksHours(contract: { includedMinutesPerPeriod: number; type: string }): boolean {
  return contract.includedMinutesPerPeriod > 0 || contract.type === 'SUPPORT_HOURS';
}

/**
 * Whether a contract is shown with an hour balance. A draft keeps no ledger yet — it has not
 * been agreed — so it reports no balance however its hour fields are filled in.
 */
export function showsBalance(contract: {
  includedMinutesPerPeriod: number;
  type: string;
  status: string;
}): boolean {
  return tracksHours(contract) && contract.status !== CONTRACT_STATUS.DRAFT;
}
