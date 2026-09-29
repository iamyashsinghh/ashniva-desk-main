import { StatTile, type StatTone } from '../../../shared/components/data-display';
import type { IconName, IconTone } from '../../../shared/components/Icon';
import type { CardTarget } from './card-targets';
import { useTargetPress } from './dashboard-actions';

/**
 * One dashboard KPI: a stat tile that opens the list it counted.
 *
 * `warn` colours the tile only while the number is above zero — "0 overdue" is good news and
 * should not look like an alarm. `caption` is where a tile that goes nowhere says why.
 */
export function KpiTile({
  label,
  value,
  target = null,
  icon,
  iconTone,
  warn = false,
  caption,
}: {
  label: string;
  value: number | string;
  target?: CardTarget | null;
  icon: IconName;
  iconTone: IconTone;
  warn?: boolean | 'warning';
  caption?: string;
}) {
  const onPress = useTargetPress(target);
  const alarming = warn !== false && typeof value === 'number' && value > 0;
  const alarmTone = warn === 'warning' ? 'warning' : 'danger';
  const tone: StatTone = alarming ? alarmTone : 'default';

  return (
    <StatTile
      label={label}
      value={value}
      icon={icon}
      iconTone={alarming ? alarmTone : iconTone}
      tone={tone}
      accessibilityLabel={caption ? `${label}: ${value}, ${caption}` : `${label}: ${value}`}
      {...(caption ? { caption } : {})}
      {...(onPress ? { onPress } : {})}
    />
  );
}
