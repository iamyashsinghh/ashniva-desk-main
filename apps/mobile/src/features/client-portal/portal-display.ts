import {
  APPROVAL_STATUS_TONES,
  CHANGE_REQUEST_STATUS_TONES,
  CLIENT_VISIBLE_STATUS_TONES,
  CONTRACT_STATUS_TONES,
  MILESTONE_STATUS_TONES,
  type Tone,
} from '@ashniva/ui/status-tone';
import {
  APPROVAL_STATUS_LABELS,
  HOUR_LEDGER_KIND,
  PROJECT_STATUS,
  type ApprovalStatus,
  type ChangeRequestStatus,
  type ClientVisibleStatus,
  type ContractHourBalance,
  type ContractStatus,
  type HourLedgerKind,
  type MilestoneStatus,
  type ProjectStatus,
  type ReportCell,
  type ReportColumn,
} from '@ashniva/types';

import type { IconTone } from '../../shared/components/Icon';
import type { PillTone } from '../../shared/components/primitives';
import { formatDate, formatDateTime, formatMinutes } from '../../shared/format/format';

/**
 * How the portal's statuses and figures read on the phone.
 *
 * The tones come from the same tables the web portal draws its pills from, so a status is the same
 * colour on both. The native pill has no `review` tone; it reads closest to info, as elsewhere in
 * the app.
 */

function pillTone(tone: Tone | undefined): PillTone {
  if (!tone) {
    return 'neutral';
  }
  return tone === 'review' ? 'info' : tone;
}

export const ICON_TONES: Record<PillTone, IconTone> = {
  neutral: 'neutral',
  info: 'info',
  progress: 'primary',
  warning: 'warning',
  success: 'success',
  danger: 'danger',
};

export function clientStatusTone(status: ClientVisibleStatus): PillTone {
  return pillTone(CLIENT_VISIBLE_STATUS_TONES[status]);
}

export function contractTone(status: ContractStatus): PillTone {
  return pillTone(CONTRACT_STATUS_TONES[status]);
}

export function milestoneTone(status: MilestoneStatus): PillTone {
  return pillTone(MILESTONE_STATUS_TONES[status]);
}

export function changeRequestTone(status: ChangeRequestStatus): PillTone {
  return pillTone(CHANGE_REQUEST_STATUS_TONES[status]);
}

/**
 * A milestone's latest approval, which the API sends as a bare string. Anything that is not a
 * known approval status is shown as it came rather than guessed at.
 */
export function milestoneApproval(status: string): { label: string; tone: PillTone } {
  if (status in APPROVAL_STATUS_LABELS) {
    const known = status as ApprovalStatus;
    return { label: APPROVAL_STATUS_LABELS[known], tone: pillTone(APPROVAL_STATUS_TONES[known]) };
  }
  return { label: status, tone: 'neutral' };
}

/** The web portal's rule: active is good news, everything else is plain. */
export function portalProjectTone(status: ProjectStatus): PillTone {
  return status === PROJECT_STATUS.ACTIVE ? 'success' : 'neutral';
}

/** Money impact of a change with its currency; a dash while the provider has not priced it. */
export function formatCost(amount: string | null, currency: string): string {
  if (amount === null) {
    return '—';
  }
  const value = Number(amount);
  return Number.isFinite(value)
    ? `${currency} ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : `${currency} ${amount}`;
}

export function formatDays(days: number): string {
  return `${days} day${Math.abs(days) === 1 ? '' : 's'}`;
}

export interface HoursLeft {
  total: number;
  remaining: number;
  percent: number;
}

/**
 * What a contract's support-hour bar shows: the hours left out of the hours granted this period.
 *
 * Remaining can go negative when the team worked past the balance; the bar stops at empty and the
 * detail screen says how far over it went.
 */
export function hoursLeft(hours: ContractHourBalance): HoursLeft {
  const total = hours.includedMinutes + hours.purchasedMinutes + hours.carriedForwardMinutes;
  const remaining = Math.max(0, hours.remainingMinutes);
  return { total, remaining, percent: total > 0 ? (remaining / total) * 100 : 0 };
}

/** Consumed and expired hours take from the balance; reserved ones are held against it. */
export function ledgerTone(kind: HourLedgerKind): PillTone {
  switch (kind) {
    case HOUR_LEDGER_KIND.CONSUMED:
      return 'danger';
    case HOUR_LEDGER_KIND.RESERVED:
      return 'warning';
    case HOUR_LEDGER_KIND.EXPIRED:
      return 'neutral';
    default:
      return 'success';
  }
}

export function signedMinutes(minutes: number): string {
  return `${minutes < 0 ? '−' : '+'}${formatMinutes(Math.abs(minutes))}`;
}

/** One report cell, by its column's kind — the same rules the web report table uses. */
export function formatCell(value: ReportCell | undefined, column: ReportColumn): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  switch (column.kind) {
    case 'minutes':
      return formatMinutes(Number(value));
    case 'percent':
      return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case 'number':
      return Number(value).toLocaleString();
    case 'money':
      return typeof value === 'number'
        ? value.toLocaleString(undefined, { minimumFractionDigits: 2 })
        : String(value);
    case 'date':
      return formatDate(String(value)) ?? String(value);
    case 'datetime':
      return formatDateTime(String(value)) ?? String(value);
    case 'status':
      return String(value)
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/^\w/, (first) => first.toUpperCase());
    default:
      return String(value);
  }
}

/** A date range for a card: "1 Sep – 30 Sep", or open-ended when there is no end. */
export function dateRange(start: string | null, end: string | null, openEnded = '—'): string {
  return `${formatDate(start) ?? '—'} – ${end ? (formatDate(end) ?? '—') : openEnded}`;
}
