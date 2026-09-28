import { Pressable, ScrollView, View, type AccessibilityRole } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Glyph } from './glyph';
import { AppText } from './primitives';

/**
 * A chip: one option among a few, or a filter that is on or off.
 *
 * Selected is a soft wash of the brand colour with a tick, not a solid block — the choice has to
 * be readable at a glance without shouting louder than the screen's primary button. The state
 * is also exposed to a screen reader, so it is never carried by colour alone.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'button',
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: AccessibilityRole;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected, ...(role === 'radio' ? { checked: selected } : {}) }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
        borderColor: selected ? theme.colors.primary : theme.colors.borderStrong,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 6,
        justifyContent: 'center',
        minHeight: TOUCH_TARGET,
        opacity: pressed ? 0.8 : 1,
        paddingHorizontal: theme.spacing.md + 2,
      })}
    >
      {selected ? <Glyph name="check" color={theme.colors.primary} size={11} /> : null}
      <AppText size="sm" weight="medium" tone={selected ? 'primary' : 'default'}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** Chips that wrap onto more lines, for a single choice inside a form. */
export function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
  labelFor = (value) => value,
}: {
  label: string;
  options: readonly T[];
  selected: T;
  onSelect: (value: T) => void;
  labelFor?: (value: T) => string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText size="sm" weight="medium">
        {label}
      </AppText>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
      >
        {options.map((option) => (
          <Chip
            key={option}
            role="radio"
            label={labelFor(option)}
            selected={option === selected}
            onPress={() => onSelect(option)}
          />
        ))}
      </View>
    </View>
  );
}

/** Chips in one scrolling row, for filters above a list. */
export function ChipScroller({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}
    >
      {children}
    </ScrollView>
  );
}
