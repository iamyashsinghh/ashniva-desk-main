import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, View, type DimensionValue } from 'react-native';

import { duration, useReducedMotion } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from './Icon';
import { AppText, cardStyle } from './primitives';

/**
 * Messages about the state of things: banners, placeholders while loading, a spinner at the foot
 * of a list.
 */

export type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

/**
 * A strip that says something about the whole screen: offline, a failed save, a warning.
 *
 * A tinted strip with a leading bar rather than another white card, so it cannot be mistaken
 * for content.
 */
export function Banner({
  title,
  children,
  tone = 'info',
  action,
  role,
}: {
  title?: string;
  children?: ReactNode;
  tone?: BannerTone;
  action?: ReactNode;
  /** `alert` for something that just went wrong and should be announced. */
  role?: 'alert';
}) {
  const theme = useTheme();
  const palette = {
    info: { color: theme.colors.info, background: theme.colors.infoSoft },
    warning: { color: theme.colors.warning, background: theme.colors.warningSoft },
    danger: { color: theme.colors.danger, background: theme.colors.dangerSoft },
    success: { color: theme.colors.success, background: theme.colors.successSoft },
    neutral: { color: theme.colors.textMuted, background: theme.colors.surfaceSunken },
  }[tone];

  return (
    <View
      accessibilityRole={role}
      style={{
        alignItems: 'flex-start',
        backgroundColor: palette.background,
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        gap: theme.spacing.sm + 2,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md - 2,
      }}
    >
      <Icon name={BANNER_ICONS[tone]} size={20} color={palette.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        {title ? (
          <AppText size="sm" weight="bold">
            {title}
          </AppText>
        ) : null}
        {typeof children === 'string' ? (
          <AppText size="sm" tone={tone === 'danger' ? 'danger' : 'muted'}>
            {children}
          </AppText>
        ) : (
          children
        )}
        {action}
      </View>
    </View>
  );
}

const BANNER_ICONS: Record<BannerTone, IconName> = {
  info: 'information-circle',
  warning: 'warning',
  danger: 'alert-circle',
  success: 'checkmark-circle',
  neutral: 'information-circle-outline',
};

/** A small, confirming line after something worked: "Saved", "Sent". */
export function SuccessNote({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}
    >
      <Icon name="checkmark-circle" color={theme.colors.success} size={16} />
      <AppText size="sm" tone="success" weight="medium">
        {label}
      </AppText>
    </View>
  );
}

/** A grey block standing in for text or a control until the real thing arrives. */
export function Skeleton({
  width = '100%',
  height = 12,
  radius,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const theme = useTheme();
  const pulse = usePulse();
  return (
    <Animated.View
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: radius ?? theme.radius.xs,
        height,
        opacity: pulse,
        width,
      }}
    />
  );
}

/** The shape of a list, a few rows deep, while the first page loads. */
export function SkeletonList({ rows = 4 }: { rows?: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ gap: theme.spacing.md, padding: theme.spacing.screen }}
    >
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[cardStyle(theme), { gap: theme.spacing.sm + 2 }]}>
          <Skeleton width="30%" height={10} />
          <Skeleton width={index % 2 ? '70%' : '88%'} height={16} />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Skeleton width={72} height={20} radius={theme.radius.pill} />
            <Skeleton width={56} height={20} radius={theme.radius.pill} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A modest spinner under the rows while the next page loads — not a screen-sized one. */
export function ListFooterLoader({ label = 'Loading more' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={{ alignItems: 'center', paddingVertical: theme.spacing.lg }}
    >
      <ActivityIndicator color={theme.colors.textFaint} />
    </View>
  );
}

function usePulse(): Animated.Value {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      value.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 0.45,
          duration: duration.slow * 3,
          useNativeDriver: true,
        }),
        Animated.timing(value, { toValue: 1, duration: duration.slow * 3, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, value]);
  return value;
}
