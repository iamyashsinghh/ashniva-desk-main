import { Pressable, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { CountBadge } from './data-display';
import { ChamferTile, Glyph } from './glyph';
import { AppText, cardStyle } from './primitives';

/**
 * The two shapes that carry everything not on the tab bar.
 *
 * A bottom bar holds five entries and the internal bar is full, so Projects, chat and the QA
 * queue are reached from the home screen instead. `NavigationRow` is what that looks like: a
 * labelled destination with a sentence saying what is behind it, tall enough to hit. As a tile
 * it sits two to a row, with a chamfered monogram in the language of the brand mark.
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
  mark,
  layout = 'row',
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
  /** One or two letters for the leading tile; the label's initial when absent. */
  mark?: string;
  layout?: 'row' | 'tile';
}) {
  const theme = useTheme();
  const tile = layout === 'tile';
  const hasBadge = badge !== undefined && badge > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hasBadge ? `${label}, ${badge} ${badgeUnit}` : label}
      accessibilityHint={description}
      onPress={onPress}
      style={({ pressed }) => [
        cardStyle(theme),
        {
          flexDirection: tile ? 'column' : 'row',
          alignItems: tile ? 'flex-start' : 'center',
          gap: tile ? theme.spacing.sm + 2 : theme.spacing.md,
          minHeight: tile ? 118 : TOUCH_TARGET,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        tile ? { flexBasis: '46%', flexGrow: 1 } : null,
        pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
      ]}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', alignSelf: tile ? 'stretch' : 'auto', justifyContent: 'space-between' }}>
        <ChamferTile label={mark ?? label.charAt(0)} size={tile ? 36 : 40} />
        {tile && hasBadge ? <CountBadge count={badge} /> : null}
      </View>
      <View style={{ flex: tile ? undefined : 1, gap: 2 }}>
        <AppText weight="bold">{label}</AppText>
        <AppText size={tile ? 'xs' : 'sm'} tone="muted" numberOfLines={tile ? 2 : undefined}>
          {description}
        </AppText>
      </View>
      {!tile ? (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
          {hasBadge ? <CountBadge count={badge} /> : null}
          <Glyph name="chevron-right" color={theme.colors.textFaint} size={12} />
        </View>
      ) : null}
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
 * than folded into a control you have to open. Drawn as one sunken track with the chosen option
 * raised out of it, so it reads as one control and not as a row of competing buttons.
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
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        gap: 2,
        padding: 3,
      }}
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
            style={({ pressed }) => [
              {
                alignItems: 'center',
                backgroundColor: selected ? theme.colors.surfaceRaised : 'transparent',
                borderRadius: theme.radius.sm + 1,
                flex: 1,
                justifyContent: 'center',
                minHeight: TOUCH_TARGET - 6,
                opacity: pressed && !selected ? 0.7 : 1,
                paddingHorizontal: theme.spacing.sm,
              },
              selected ? theme.shadow.card : null,
            ]}
          >
            <AppText
              size="sm"
              weight={selected ? 'bold' : 'medium'}
              tone={selected ? 'default' : 'muted'}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
