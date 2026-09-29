import {
  CONTRACT_STATUS_TONES,
  PAYMENT_MILESTONE_STATUS_TONES,
  type Tone,
} from '@ashniva/ui/status-tone';
import {
  CONTRACT_LIST_VIEW,
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE,
  CONTRACT_TYPE_LABELS,
  HOUR_LEDGER_KIND,
  PAYMENT_MILESTONE_STATUS_LABELS,
  type ContractHourBalance,
  type ContractListView,
  type ContractStatus,
  type ContractType,
  type HourLedgerKind,
  type PaymentMilestoneStatus,
} from '@ashniva/types';

import type { PillTone } from '../../shared/components/primitives';
import type { SelectOption } from '../../shared/components/SelectSheet';
import type { TabOption } from '../../shared/components/TabBar';
import { formatMinutes } from '../../shared/format/format';

/**
 * Words and colours for contracts, in one place so the list, the detail screen and the form agree.
 *
 * Colours come from the shared tone tables in `@ashniva/ui/status-tone`, the same ones the web
 * paints its pills with; only `review`, which the native pill does not draw, is folded into info.
 */

function toPillTone(tone: Tone | undefined): PillTone {
  if (!tone) {
    return 'neutral';
  }
  return tone === 'review' ? 'info' : tone;
}

export function contractStatusTone(status: ContractStatus): PillTone {
  return toPillTone(CONTRACT_STATUS_TONES[status]);
}

export function contractStatusLabel(status: ContractStatus): string {
  return CONTRACT_STATUS_LABELS[status] ?? status;
}

export function contractTypeLabel(type: ContractType): string {
  return CONTRACT_TYPE_LABELS[type] ?? type;
}

export function paymentStatusTone(status: PaymentMilestoneStatus): PillTone {
  return toPillTone(PAYMENT_MILESTONE_STATUS_TONES[status]);
}

export function paymentStatusLabel(status: PaymentMilestoneStatus): string {
  return PAYMENT_MILESTONE_STATUS_LABELS[status] ?? status;
}

export const CONTRACT_VIEWS: readonly TabOption<ContractListView>[] = [
  { value: CONTRACT_LIST_VIEW.ACTIVE, label: 'Active', icon: 'checkmark-circle-outline' },
  { value: CONTRACT_LIST_VIEW.EXPIRING, label: 'Expiring soon', icon: 'alarm-outline' },
  { value: CONTRACT_LIST_VIEW.DRAFT, label: 'Drafts', icon: 'create-outline' },
  { value: CONTRACT_LIST_VIEW.EXPIRED, label: 'Expired', icon: 'time-outline' },
  { value: CONTRACT_LIST_VIEW.ARCHIVED, label: 'Archived', icon: 'archive-outline' },
  { value: CONTRACT_LIST_VIEW.ALL, label: 'All', icon: 'albums-outline' },
];

export const CONTRACT_TYPE_OPTIONS: readonly SelectOption<ContractType>[] = Object.values(
  CONTRACT_TYPE,
).map((type) => ({ value: type, label: CONTRACT_TYPE_LABELS[type] }));

/** Types that are about support hours, so the hour terms are offered without being asked. */
export const HOURS_TYPES: readonly ContractType[] = [
  CONTRACT_TYPE.SUPPORT_HOURS,
  CONTRACT_TYPE.AMC,
  CONTRACT_TYPE.RETAINER,
];

/** Money as the API sends it — a decimal string — with its currency; "—" when there is none. */
export function formatMoney(amount: string | null, currency: string): string {
  if (amount === null || amount === '') {
    return '—';
  }
  const value = Number(amount);
  return Number.isFinite(value)
    ? `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${currency} ${amount}`;
}

/** "12 h left", or how far over the balance has gone — never a negative number of hours. */
export function hoursLeftLabel(hours: ContractHourBalance): string {
  if (hours.remainingMinutes < 0) {
    return `${formatMinutes(-hours.remainingMinutes)} over`;
  }
  return `${formatMinutes(hours.remainingMinutes)} left`;
}

export function hoursTone(hours: ContractHourBalance): PillTone {
  if (hours.remainingMinutes < 0) {
    return 'danger';
  }
  return hours.isLow ? 'warning' : 'success';
}

/** Signed minutes as the ledger shows them: "+5 h", "−30 min". */
export function signedMinutes(minutes: number): string {
  return `${minutes < 0 ? '−' : '+'}${formatMinutes(Math.abs(minutes))}`;
}

/** A balance that may have gone below zero: "12 h", "−1 h 30 min". */
export function formatBalance(minutes: number): string {
  return minutes < 0 ? `−${formatMinutes(-minutes)}` : formatMinutes(minutes);
}

const LEDGER_TONES: Partial<Record<HourLedgerKind, PillTone>> = {
  [HOUR_LEDGER_KIND.CONSUMED]: 'danger',
  [HOUR_LEDGER_KIND.EXPIRED]: 'neutral',
  [HOUR_LEDGER_KIND.RESERVED]: 'warning',
};

export function ledgerTone(kind: HourLedgerKind): PillTone {
  return LEDGER_TONES[kind] ?? 'success';
}

/** The kinds a person records by hand; the rest the system writes as time is logged or expires. */
export const MANUAL_HOUR_KINDS = [
  HOUR_LEDGER_KIND.PURCHASED,
  HOUR_LEDGER_KIND.ADJUSTMENT,
  HOUR_LEDGER_KIND.RESERVED,
  HOUR_LEDGER_KIND.RELEASED,
] as const;

export type ManualHourKind = (typeof MANUAL_HOUR_KINDS)[number];

/**
 * What a contract write makes stale. Milestones and change requests show the contract they belong
 * to, and the dashboards count expiring contracts and low balances.
 */
export const CONTRACT_INVALIDATES = [['contracts'], ['milestones'], ['dashboard']] as const;

/** An amount the API will take: digits, and at most two decimals. */
export function isAmount(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim());
}

/**
 * Minutes as hours for a text field. Two decimals is enough: converting back rounds to the same
 * whole minute, and "1.67" is typeable where "1.6666666666666667" is not.
 */
export function minutesToHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

/** Hours typed as text, to whole minutes; null when it is not a number. */
export function hoursToMinutes(hours: string): number | null {
  const trimmed = hours.trim();
  if (trimmed === '') {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.round(value * 60) : null;
}
