import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { IconName } from './Icon';

/**
 * The small marks inside controls: a chevron, a plus, a tick.
 *
 * A short list of names the app has always used, mapped onto Ionicons, and any Ionicons name as
 * well — so a button can carry `check` or `paper-plane-outline` through the same prop.
 *
 * Always decorative. Every control that shows one also has words, or an accessibility label
 * that says what it does.
 */
export type GlyphName =
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'plus'
  | 'close'
  | 'check'
  | 'arrow-up'
  | 'dot'
  | 'clock';

const GLYPH_ICONS: Record<GlyphName, IconName> = {
  'chevron-right': 'chevron-forward',
  'chevron-left': 'chevron-back',
  'chevron-down': 'chevron-down',
  'chevron-up': 'chevron-up',
  plus: 'add',
  close: 'close',
  check: 'checkmark',
  'arrow-up': 'arrow-up',
  dot: 'ellipse',
  clock: 'time-outline',
};

export function glyphIcon(name: GlyphName | IconName): IconName {
  return name in GLYPH_ICONS ? GLYPH_ICONS[name as GlyphName] : (name as IconName);
}

export function Glyph({
  name,
  color,
  size = 14,
}: {
  name: GlyphName | IconName;
  color?: string;
  size?: number;
  /** Kept for older call sites; the icon font sets its own weight. */
  strokeWidth?: number;
}) {
  const theme = useTheme();
  // Ionicons draw inside their em box with some padding, so a touch larger reads the same size.
  const drawn = Math.round(size * 1.25);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ alignItems: 'center', height: size, justifyContent: 'center', width: size }}
    >
      <Ionicons name={glyphIcon(name)} size={drawn} color={color ?? theme.colors.textMuted} />
    </View>
  );
}

/**
 * A square tile with the brand's chamfered top-left corner, holding a letter or two.
 *
 * Used for a group's avatar, so a group and a person are told apart at a glance. The corner is
 * cut by a triangle in the colour behind the tile, so `cutColor` must match what the tile sits on.
 */
export function ChamferTile({
  label,
  size = 40,
  background,
  color,
  cutColor,
  style,
}: {
  label?: string;
  size?: number;
  background?: string;
  color?: string;
  cutColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const cut = Math.round(size * 0.26);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          alignItems: 'center',
          backgroundColor: background ?? theme.colors.primarySoft,
          borderRadius: Math.max(2, size * 0.06),
          height: size,
          justifyContent: 'center',
          overflow: 'hidden',
          width: size,
        },
        style,
      ]}
    >
      <View
        style={{
          borderRightColor: 'transparent',
          borderRightWidth: cut,
          borderTopColor: cutColor ?? theme.colors.surface,
          borderTopWidth: cut,
          height: 0,
          left: 0,
          position: 'absolute',
          top: 0,
          width: 0,
        }}
      />
      {label ? (
        <Text
          style={{
            color: color ?? theme.colors.primary,
            fontSize: Math.round(size * 0.36),
            fontWeight: '700',
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}
