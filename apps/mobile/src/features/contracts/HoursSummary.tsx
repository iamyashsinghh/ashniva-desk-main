import type { ContractHourBalance } from '@ashniva/types';

import { StatTile, TileGrid } from '../../shared/components/data-display';
import { formatDate, formatMinutes } from '../../shared/format/format';

/**
 * The current period's balance as tiles. Remaining is never drawn below zero — an overdrawn
 * contract says how far over it is instead, which is the number somebody has to act on.
 */
export function HoursSummary({ hours }: { hours: ContractHourBalance }) {
  const over = hours.remainingMinutes < 0;
  const period =
    hours.periodStart || hours.periodEnd
      ? `${formatDate(hours.periodStart) ?? '—'} – ${formatDate(hours.periodEnd) ?? '—'}`
      : undefined;
  const caption = over ? `${formatMinutes(-hours.remainingMinutes)} over` : period;
  let remainingTone: 'danger' | 'warning' | 'success' = 'success';
  if (over) {
    remainingTone = 'danger';
  } else if (hours.isLow) {
    remainingTone = 'warning';
  }
  return (
    <TileGrid>
      <StatTile
        label="Remaining"
        value={formatMinutes(Math.max(0, hours.remainingMinutes))}
        tone={remainingTone}
        icon="hourglass-outline"
        {...(caption ? { caption } : {})}
      />
      <StatTile label="Used" value={formatMinutes(hours.consumedMinutes)} icon="timer-outline" />
      <StatTile
        label="Included"
        value={formatMinutes(hours.includedMinutes)}
        icon="layers-outline"
      />
      <StatTile
        label="Purchased"
        value={formatMinutes(hours.purchasedMinutes)}
        icon="add-circle-outline"
      />
      <StatTile
        label="Carried forward"
        value={formatMinutes(hours.carriedForwardMinutes)}
        icon="arrow-redo-outline"
      />
      <StatTile
        label="Reserved"
        value={formatMinutes(hours.reservedMinutes)}
        icon="bookmark-outline"
      />
    </TileGrid>
  );
}
