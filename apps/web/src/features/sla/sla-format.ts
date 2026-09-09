import { SLA_TARGET_STATUS, type SlaTargetState } from '@ashniva/types';

import { formatDateTime } from '../../shared/lib/format';

/** "2h 15m left" / "3h 05m over" from backend-computed minutes; the browser never runs a clock. */
export function describeRemaining(target: SlaTargetState): string {
  if (target.status === SLA_TARGET_STATUS.PAUSED) {
    return 'Clock paused';
  }
  if (target.metAt) {
    return `Reached ${formatDateTime(target.metAt)}`;
  }
  if (target.remainingMinutes === null) {
    return '—';
  }
  const absolute = Math.abs(target.remainingMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  const span = hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
  return target.remainingMinutes < 0 ? `${span} over` : `${span} left`;
}
