import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { DISABLED_OPACITY, TOUCH_TARGET, type TypeVariant } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Glyph, type GlyphName } from './glyph';

// Form controls live in their own file; re-exported so every screen keeps one import.
export { Field, Input } from './form-controls';
export { Pill, PillRow, pillColors, type PillTone } from './pill';

/**
 * The building blocks every screen uses.
 *
 * Small and deliberate rather than a component library. Three rules hold throughout and are
 * easier to keep in a handful of components than in thirty screens:
 *
 * - Nothing tappable is smaller than 44 points.
 * - No input's text is smaller than 16 points, which is the size below which the platforms zoom.
 * - Every colour comes from the theme, so dark mode and tenant branding both work without a
 *   screen knowing about either.
 */

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>{children}</View>
  );
}

/**
 * A surface that groups one thing.
 *
 * Told apart from the background by colour and a hint of lift rather than a drawn border; the
 * hairline stays where a shadow does not render well (Android, dark mode).
 */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const theme = useTheme();
  return <View style={[cardStyle(theme, padded), style]}>{children}</View>;
}

export function cardStyle(theme: ReturnType<typeof useTheme>, padded = true): ViewStyle {
  const hairline = theme.isDark || Platform.OS !== 'ios';
  return {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderWidth: hairline ? StyleSheet.hairlineWidth : 0,
    gap: theme.spacing.sm,
    padding: padded ? theme.spacing.lg : 0,
    ...(hairline ? {} : theme.shadow.card),
  };
}

/** `inverse` is for text sitting on the brand colour — a badge, a selected segment. */
type TextTone =
  | 'default'
  | 'muted'
  | 'faint'
  | 'danger'
  | 'inverse'
  | 'primary'
  | 'success'
  | 'warning';
type TextSize = 'xs' | 'sm' | 'body' | 'lg' | 'xl';
type TextWeight = 'regular' | 'medium' | 'bold';

const FONT_WEIGHTS: Record<TextWeight, '400' | '600' | '700'> = {
  regular: '400',
  medium: '600',
  bold: '700',
};

/** The legacy sizes, mapped onto the type scale so old call sites keep the new rhythm. */
const SIZE_VARIANT: Record<TextSize, TypeVariant> = {
  xs: 'caption',
  sm: 'bodySm',
  body: 'body',
  lg: 'heading',
  xl: 'title',
};

export function AppText({
  children,
  tone = 'default',
  size = 'body',
  weight,
  variant,
  numberOfLines,
  align,
  tabular = false,
  uppercase = false,
  style,
}: {
  children: ReactNode;
  tone?: TextTone;
  size?: TextSize;
  weight?: TextWeight;
  /** The role in the type scale; wins over `size`. */
  variant?: TypeVariant;
  numberOfLines?: number;
  align?: TextStyle['textAlign'];
  /** Figures of equal width, so counts and amounts line up. */
  tabular?: boolean;
  uppercase?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  const color = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    danger: theme.colors.danger,
    inverse: theme.colors.primaryText,
    primary: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
  }[tone];
  const scale = theme.typography[variant ?? SIZE_VARIANT[size]];

  return (
    <Text
      numberOfLines={numberOfLines}
      // Font scaling stays on: someone who has set large text has asked for large text.
      style={[
        scale,
        {
          color,
          ...(weight ? { fontWeight: FONT_WEIGHTS[weight] } : {}),
          ...(align ? { textAlign: align } : {}),
          ...(tabular ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : {}),
          ...(uppercase ? { textTransform: 'uppercase' as const } : {}),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  accessibilityHint,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  /** A leading glyph. The label is always shown; a glyph never replaces words. */
  icon?: GlyphName;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const background = {
    primary: theme.colors.primary,
    secondary: theme.colors.surfaceRaised,
    ghost: 'transparent',
    danger: theme.colors.danger,
    dangerGhost: 'transparent',
  }[variant];
  const foreground = {
    primary: theme.colors.primaryText,
    secondary: theme.colors.text,
    ghost: theme.colors.primary,
    danger: theme.colors.primaryText,
    dangerGhost: theme.colors.danger,
  }[variant];
  const bordered = variant === 'secondary';
  const small = size === 'sm';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={small ? 4 : undefined}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          backgroundColor: background,
          borderColor: theme.colors.borderStrong,
          borderRadius: theme.radius.md,
          borderWidth: bordered ? StyleSheet.hairlineWidth : 0,
          flexDirection: 'row',
          gap: theme.spacing.sm,
          justifyContent: 'center',
          // A small button is still a comfortable target: the hit slop makes up the difference.
          minHeight: small ? 36 : TOUCH_TARGET + 4,
          opacity: pressOpacity(inactive, pressed),
          paddingHorizontal: small ? theme.spacing.md : theme.spacing.lg,
          paddingVertical: small ? theme.spacing.xs : theme.spacing.md,
          transform: [{ scale: pressed && !inactive ? 0.98 : 1 }],
        },
        pressed && (variant === 'ghost' || variant === 'dangerGhost')
          ? { backgroundColor: theme.colors.surfaceSunken }
          : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {icon ? <Glyph name={icon} color={foreground} size={small ? 12 : 14} /> : null}
          <Text
            style={{
              ...theme.typography.button,
              color: foreground,
              fontSize: small ? theme.fontSize.sm : theme.typography.button.fontSize,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Dimmed when unavailable, and a touch dimmer while held: two states, not a nested ternary. */
function pressOpacity(inactive: boolean, pressed: boolean): number {
  if (inactive) {
    return DISABLED_OPACITY;
  }
  return pressed ? 0.88 : 1;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.border,
        height: StyleSheet.hairlineWidth,
        marginLeft: inset,
      }}
    />
  );
}
