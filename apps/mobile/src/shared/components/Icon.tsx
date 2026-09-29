import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { Theme } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A pictogram from the Ionicons set.
 *
 * Always decorative: every control that shows one also has words, or an accessibility label that
 * says what it does, so the icon is hidden from screen readers.
 */
export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 18,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Ionicons name={name} size={size} color={color ?? theme.colors.textMuted} />
    </View>
  );
}

export type IconTone =
  | 'primary'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'violet'
  | 'teal'
  | 'orange'
  | 'pink';

export function iconToneColors(
  theme: Theme,
  tone: IconTone,
): { color: string; background: string } {
  const { colors, accents } = theme;
  switch (tone) {
    case 'primary':
      return { color: colors.primary, background: colors.primarySoft };
    case 'info':
      return { color: colors.info, background: colors.infoSoft };
    case 'success':
      return { color: colors.success, background: colors.successSoft };
    case 'warning':
      return { color: colors.warning, background: colors.warningSoft };
    case 'danger':
      return { color: colors.danger, background: colors.dangerSoft };
    case 'neutral':
      return { color: colors.textMuted, background: colors.surfaceSunken };
    default:
      return accents[tone];
  }
}

/** An icon on a soft, rounded tile in its tone's colour: the leading mark of a row or card. */
export function IconTile({
  name,
  tone = 'primary',
  size = 40,
  solid = false,
  style,
}: {
  name: IconName;
  tone?: IconTone;
  size?: number;
  /** Filled with the tone's colour instead of its soft wash, for the one thing that matters most. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { color, background } = iconToneColors(theme, tone);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignItems: 'center',
          backgroundColor: solid ? color : background,
          borderRadius: Math.round(size * 0.3),
          height: size,
          justifyContent: 'center',
          width: size,
        },
        style,
      ]}
    >
      <Ionicons name={name} size={Math.round(size * 0.5)} color={solid ? '#ffffff' : color} />
    </View>
  );
}
