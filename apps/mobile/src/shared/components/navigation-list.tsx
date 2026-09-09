import { Pressable, StyleSheet, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { AppText } from './primitives';

/**
 * The two shapes that carry everything not on the tab bar.
 *
 * A bottom bar holds five entries and the internal bar is full, so Projects, chat and the QA
 * queue are reached from the home screen instead. `NavigationRow` is what that looks like: a
 * labelled destination with a sentence saying what is behind it, tall enough to hit.
 *
 * `Segmented` is the other half — switching between views of the *same* list, which is a
 * different question from going somewhere else and should not look like one.
 */

export function NavigationRow({
  label,
  description,
  badge,
  badgeUnit = 'unread',
  onPress,
}: {
  label: string;
  description: string;
  /** A count worth seeing before you tap, such as unread messages. */
  badge?: number;
  /**
   * What the count counts, for the screen reader. A number alone is not readable — "Approvals, 3"
   * is a puzzle — and the word differs per row, so it is a prop rather than a constant.
   */
  badgeUnit?: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} ${badgeUnit}` : label}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        gap: theme.spacing.xs,
        minHeight: TOUCH_TARGET,
        opacity: pressed ? 0.7 : 1,
        padding: theme.spacing.lg,
      })}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppText weight="medium">{label}</AppText>
        </View>
        {badge && badge > 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: theme.radius.pill,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
            }}
          >
            <AppText size="xs" weight="bold" tone="inverse">
              {badge > 99 ? '99+' : badge}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText size="sm" tone="muted">
        {description}
      </AppText>
    </Pressable>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Switching between views of one list.
 *
 * A row of buttons rather than a picker: with two or three options the picker's extra tap and its
 * modal buy nothing, and on a list screen the current view has to be readable at a glance rather
 * than folded into a control you have to open.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What the whole control chooses, for a screen reader. */
  label: string;
}) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: theme.spacing.sm }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              alignItems: 'center',
              backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceRaised,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.pill,
              borderWidth: StyleSheet.hairlineWidth,
              flex: 1,
              justifyContent: 'center',
              minHeight: TOUCH_TARGET,
              opacity: pressed ? 0.8 : 1,
              paddingHorizontal: theme.spacing.md,
            })}
          >
            <AppText
              size="sm"
              weight={selected ? 'bold' : 'regular'}
              tone={selected ? 'inverse' : 'default'}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
