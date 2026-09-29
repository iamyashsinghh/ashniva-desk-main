import { SLA_TARGET_STATUS, type SlaTargetState, type SlaTargetStatus } from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import { formatDateTime } from '../../shared/format/format';

/**
 * Putting an SLA target into words.
 *
 * Every number here was computed by the API. The phone never runs a clock of its own: business
 * hours, pauses and the policy's timezone all live on the server, and a device-side countdown
 * would drift from the one the support desk is measured against.
 */

/** "2h 15m" from a count of minutes, the way the web's SLA card writes it. */
export function formatSpan(totalMinutes: number): string {
  const absolute = Math.abs(Math.round(totalMinutes));
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
  }
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}

/** "2h 15m left" / "3h 05m over" / "Clock paused" / "Reached 12 Sep, 10:30". */
export function describeRemaining(
  target: SlaTargetState,
  formatInstant: (value: string | null) => string | null = formatDateTime,
): string {
  if (target.status === SLA_TARGET_STATUS.PAUSED) {
    return 'Clock paused';
  }
  if (target.metAt) {
    return `Reached ${formatInstant(target.metAt) ?? ''}`.trim();
  }
  if (target.remainingMinutes === null) {
    return '—';
  }
  const span = formatSpan(target.remainingMinutes);
  return target.remainingMinutes < 0 ? `${span} over` : `${span} left`;
}

export function slaIcon(status: SlaTargetStatus): IconName {
  switch (status) {
    case SLA_TARGET_STATUS.BREACHED:
      return 'alert-circle';
    case SLA_TARGET_STATUS.AT_RISK:
      return 'alarm-outline';
    case SLA_TARGET_STATUS.PAUSED:
      return 'pause-circle-outline';
    case SLA_TARGET_STATUS.MET:
    case SLA_TARGET_STATUS.MET_LATE:
      return 'checkmark-circle-outline';
    case SLA_TARGET_STATUS.NONE:
      return 'remove-circle-outline';
    default:
      return 'time-outline';
  }
}

/** Whether a list row should carry an SLA pill: only when the clock is a problem. */
export function slaNeedsAttention(status: SlaTargetStatus | undefined): boolean {
  return status === SLA_TARGET_STATUS.AT_RISK || status === SLA_TARGET_STATUS.BREACHED;
}
