import { Pressable, View } from 'react-native';

import { DateTimeField } from '../../shared/components/DateTimeField';
import { Icon } from '../../shared/components/Icon';
import { todayIsoDate } from '../../shared/format/format';
import { DISABLED_OPACITY, TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { shiftIsoDate } from './report-format';

/**
 * A day, with a step either side.
 *
 * Reading yesterday's report, then the day before, is the common walk through this screen; a
 * calendar for each step would be three taps where one does. There is no stepping into tomorrow,
 * which has no report yet.
 */
export function DayPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const theme = useTheme();
  const atToday = value >= todayIsoDate();

  const step = (days: number, name: string, icon: 'chevron-back' | 'chevron-forward') => {
    const disabled = days > 0 && atToday;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onChange(shiftIsoDate(value, days))}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.borderStrong,
          borderRadius: theme.radius.sm + 2,
          borderWidth: 1,
          justifyContent: 'center',
          minHeight: TOUCH_TARGET + 4,
          opacity: stepOpacity(disabled, pressed),
          width: TOUCH_TARGET + 4,
        })}
      >
        <Icon name={icon} size={20} color={theme.colors.text} />
      </Pressable>
    );
  };

  return (
    <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: theme.spacing.sm }}>
      {step(-1, 'Previous day', 'chevron-back')}
      <View style={{ flex: 1 }}>
        <DateTimeField
          label={label}
          value={value}
          allowClear={false}
          onChange={(next) => onChange(next ?? todayIsoDate())}
        />
      </View>
      {step(1, 'Next day', 'chevron-forward')}
    </View>
  );
}

function stepOpacity(disabled: boolean, pressed: boolean): number {
  if (disabled) {
    return DISABLED_OPACITY;
  }
  return pressed ? 0.7 : 1;
}
