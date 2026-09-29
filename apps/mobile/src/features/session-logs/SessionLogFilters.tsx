import { View } from 'react-native';

import { Chip, ChipScroller } from '../../shared/components/chips';
import { DateTimeField } from '../../shared/components/DateTimeField';
import { Segmented } from '../../shared/components/navigation-list';
import { UserPicker } from '../../shared/components/pickers';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { RANGE_PRESETS, type DayRange, type RangePreset } from './session-log-display';

export type SessionLogView = 'sessions' | 'events';

const VIEWS = [
  { value: 'sessions', label: 'Sessions' },
  { value: 'events', label: 'Timeline' },
] as const;

/**
 * The web page's header controls — view, person, from and to — laid out for one column.
 *
 * The date range leads with presets because typing two dates on a phone is the slow way to ask
 * "who was in today"; Custom still opens the two date fields the web offers.
 */
export function SessionLogFilters({
  view,
  onViewChange,
  preset,
  onPresetChange,
  range,
  onRangeChange,
  userId,
  onUserChange,
}: {
  view: SessionLogView;
  onViewChange: (view: SessionLogView) => void;
  preset: RangePreset;
  onPresetChange: (preset: RangePreset) => void;
  range: DayRange;
  onRangeChange: (range: DayRange) => void;
  userId: string | null;
  onUserChange: (userId: string | null) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Segmented options={VIEWS} value={view} onChange={onViewChange} label="View" />
      <View accessibilityRole="radiogroup" accessibilityLabel="Dates">
        <ChipScroller>
          {RANGE_PRESETS.map((option) => (
            <Chip
              key={option.value}
              role="radio"
              label={option.label}
              selected={option.value === preset}
              onPress={() => onPresetChange(option.value)}
            />
          ))}
        </ChipScroller>
      </View>
      {preset === 'custom' ? (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <DateTimeField
              label="From"
              value={range.from}
              placeholder="Any"
              onChange={(from) => onRangeChange({ ...range, from })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateTimeField
              label="To"
              value={range.to}
              placeholder="Any"
              onChange={(to) => onRangeChange({ ...range, to })}
            />
          </View>
        </View>
      ) : null}
      <UserPicker
        label="Person"
        value={userId ? [userId] : []}
        onChange={(ids) => onUserChange(ids[0] ?? null)}
        placeholder="Anyone"
      />
    </View>
  );
}
