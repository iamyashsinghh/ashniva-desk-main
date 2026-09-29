import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Glyph } from './glyph';
import { IconTile, type IconName, type IconTone } from './Icon';
import { AppText, cardStyle } from './primitives';

export { CountBadge, MetaLine } from './badges';

/**
 * Showing numbers and facts: a headline figure, a bar, a label beside its value, a row in a
 * settings list.
 */

export type StatTone = 'default' | 'danger' | 'warning' | 'success' | 'primary';

/**
 * One headline number with what it counts.
 *
 * The number is the thing: big, tabular, and coloured only when its tone means something (an
 * overdue count, not a pleasant accent). Tappable when there is a list behind it.
 */
export function StatTile({
  label,
  value,
  caption,
  tone = 'default',
  onPress,
  accessibilityLabel,
  icon,
  iconTone,
  children,
}: {
  label: string;
  value: string | number;
  caption?: string;
  tone?: StatTone;
  onPress?: () => void;
  accessibilityLabel?: string;
  icon?: IconName;
  /** The tile's colour; follows `tone` when absent. */
  iconTone?: IconTone;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const textTone = tone === 'default' ? 'default' : tone;
  const body = (
    <>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        {icon ? (
          <IconTile
            name={icon}
            tone={iconTone ?? (tone === 'default' ? 'primary' : tone)}
            size={30}
          />
        ) : null}
        <AppText size="sm" tone="muted" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </AppText>
      </View>
      <AppText variant="display" tone={textTone} tabular>
        {value}
      </AppText>
      {caption ? (
        <AppText size="xs" tone="faint" numberOfLines={1}>
          {caption}
        </AppText>
      ) : null}
      {children}
    </>
  );

  const style = [
    cardStyle(theme),
    { flexBasis: 0, flexGrow: 1, gap: 4, minWidth: 140 },
    tone === 'danger' || tone === 'warning'
      ? { borderLeftColor: theme.colors[tone], borderLeftWidth: 3 }
      : null,
  ];

  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
        style={style}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        ...style,
        pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

/** A two-column grid of tiles that reflows to one on a very narrow or very large-text screen. */
export function TileGrid({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
      {children}
    </View>
  );
}

/** A bar from 0 to 100. */
export function ProgressBar({
  percent,
  tone = 'primary',
  height = 6,
  label,
}: {
  percent: number;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  height?: number;
  /** What the bar measures, for a screen reader. */
  label?: string;
}) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityValue={label ? { min: 0, max: 100, now: clamped } : undefined}
      style={{
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: height / 2,
        height,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors[tone],
          borderRadius: height / 2,
          height,
          width: `${clamped}%`,
        }}
      />
    </View>
  );
}

/** A label on the left and its value on the right: a totals table, a list of dates. */
export function KeyValueRow({
  label,
  value,
  emphasis = false,
  tone,
}: {
  label: string;
  value: ReactNode;
  /** The row that matters most in its group — a total, a balance due. */
  emphasis?: boolean;
  tone?: 'danger' | 'success';
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'baseline',
        flexDirection: 'row',
        gap: theme.spacing.md,
        justifyContent: 'space-between',
        paddingVertical: 2,
      }}
    >
      <AppText
        size={emphasis ? 'body' : 'sm'}
        tone="muted"
        weight={emphasis ? 'medium' : undefined}
      >
        {label}
      </AppText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <View style={{ flexShrink: 1 }}>
          <AppText
            size={emphasis ? 'lg' : 'sm'}
            weight={emphasis ? 'bold' : 'medium'}
            tone={tone ?? 'default'}
            align="right"
            tabular
          >
            {value}
          </AppText>
        </View>
      ) : (
        value
      )}
    </View>
  );
}

/**
 * A row in a grouped list: a leading mark, a title and a line under it, and whatever sits at the
 * trailing edge — a value, a switch, a chevron.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  destructive = false,
  icon,
  iconTone,
}: {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  destructive?: boolean;
  /** A leading icon tile, when there is no other `leading`. */
  icon?: IconName;
  iconTone?: IconTone;
}) {
  const theme = useTheme();
  const content = (
    <>
      {leading ??
        (icon ? (
          <IconTile name={icon} tone={iconTone ?? (destructive ? 'danger' : 'primary')} size={36} />
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium" tone={destructive ? 'danger' : 'default'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText size="sm" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <Glyph name="chevron-right" color={theme.colors.textFaint} size={14} /> : null)}
    </>
  );
  const rowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    minHeight: TOUCH_TARGET + 8,
    paddingVertical: theme.spacing.sm,
  };

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  );
}
