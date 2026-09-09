import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The building blocks every screen uses.
 *
 * Small and deliberate rather than a component library. Three rules hold throughout and are
 * easier to keep in six components than in thirty screens:
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

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** `inverse` is for text sitting on the brand colour — a badge, a selected segment. */
type TextTone = 'default' | 'muted' | 'faint' | 'danger' | 'inverse';
type TextSize = 'xs' | 'sm' | 'body' | 'lg' | 'xl';
type TextWeight = 'regular' | 'medium' | 'bold';

const FONT_WEIGHTS: Record<TextWeight, '400' | '600' | '700'> = {
  regular: '400',
  medium: '600',
  bold: '700',
};

export function AppText({
  children,
  tone = 'default',
  size = 'body',
  weight = 'regular',
  numberOfLines,
}: {
  children: ReactNode;
  tone?: TextTone;
  size?: TextSize;
  weight?: TextWeight;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  const color = {
    default: theme.colors.text,
    muted: theme.colors.textMuted,
    faint: theme.colors.textFaint,
    danger: theme.colors.danger,
    inverse: theme.colors.primaryText,
  }[tone];

  return (
    <Text
      numberOfLines={numberOfLines}
      // Font scaling stays on: someone who has set large text has asked for large text.
      style={{
        color,
        fontSize: theme.fontSize[size],
        fontWeight: FONT_WEIGHTS[weight],
        lineHeight: theme.fontSize[size] * 1.4,
      }}
    >
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const background = {
    primary: theme.colors.primary,
    secondary: theme.colors.surfaceRaised,
    danger: theme.colors.danger,
  }[variant];
  const foreground = variant === 'secondary' ? theme.colors.text : theme.colors.primaryText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: background,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.md,
        borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
        justifyContent: 'center',
        minHeight: TOUCH_TARGET,
        opacity: pressOpacity(inactive, pressed),
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={{ color: foreground, fontSize: theme.fontSize.body, fontWeight: '600' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Dimmed when unavailable, and a touch dimmer while held: two states, not a nested ternary. */
function pressOpacity(inactive: boolean, pressed: boolean): number {
  if (inactive) {
    return 0.5;
  }
  return pressed ? 0.85 : 1;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <AppText size="sm" tone="muted" weight="medium">
        {label}
      </AppText>
      {children}
      {hint ? (
        <AppText size="xs" tone="faint">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Input({ style, ...props }: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.colors.textFaint}
      style={[
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.sm,
          borderWidth: StyleSheet.hairlineWidth,
          color: theme.colors.text,
          // 16, never smaller: the platforms zoom a focused input below that.
          fontSize: theme.fontSize.input,
          minHeight: TOUCH_TARGET,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
        },
        style,
      ]}
      {...props}
    />
  );
}

export type PillTone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: PillTone }) {
  const theme = useTheme();
  const color = {
    neutral: theme.colors.textMuted,
    info: theme.colors.info,
    progress: theme.colors.info,
    warning: theme.colors.warning,
    success: theme.colors.success,
    danger: theme.colors.danger,
  }[tone];

  return (
    <View
      // Read out as one thing rather than a stray word floating next to the title.
      accessible
      accessibilityLabel={`Status: ${label}`}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.pillBackground,
        borderRadius: theme.radius.pill,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <Text style={{ color, fontSize: theme.fontSize.xs, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.border, height: StyleSheet.hairlineWidth }} />
  );
}
