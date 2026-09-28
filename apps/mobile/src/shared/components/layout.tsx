import { useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { animateLayout } from '../theme/motion';
import { TOUCH_TARGET } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { Glyph } from './glyph';
import { AppText, cardStyle } from './primitives';

/**
 * How a screen is put together: section headings, tappable cards, collapsible sections and the
 * bar that keeps a screen's main action within thumb's reach.
 */

/** The heading over a group of content, with an optional count and a trailing action. */
export function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        justifyContent: 'space-between',
        minHeight: 28,
      }}
    >
      <View style={{ alignItems: 'baseline', flexDirection: 'row', flexShrink: 1, gap: 6 }}>
        <AppText variant="label" tone="muted" uppercase>
          {title}
        </AppText>
        {count !== undefined ? (
          <AppText variant="label" tone="faint" tabular>
            {count}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/**
 * A card that opens something.
 *
 * The chevron says "this goes somewhere" before anybody has to try; the press state confirms it.
 * The accessible name is passed in rather than read from the children, because a row's visible
 * text is several fragments and a screen reader needs one sentence.
 */
export function PressableCard({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  chevron = true,
  highlight = false,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  chevron?: boolean;
  /** An unread or waiting-for-you item: a brand-coloured edge on the leading side. */
  highlight?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [
        cardStyle(theme),
        {
          alignItems: 'center',
          flexDirection: 'row',
          gap: theme.spacing.md,
          overflow: 'hidden',
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
        pressed ? { backgroundColor: theme.colors.surfaceSunken } : null,
        style,
      ]}
    >
      {highlight ? (
        <View
          style={{
            backgroundColor: theme.colors.primary,
            bottom: 0,
            left: 0,
            position: 'absolute',
            top: 0,
            width: 3,
          }}
        />
      ) : null}
      <View style={{ flex: 1, gap: theme.spacing.xs + 2 }}>{children}</View>
      {chevron ? <Glyph name="chevron-right" color={theme.colors.textFaint} size={12} /> : null}
    </Pressable>
  );
}

/**
 * A card with a heading, optionally folded away.
 *
 * Long detail screens are mostly secondary sections — history, logs, attachments — and folding
 * them lets the primary information and the actions sit in the first screenful. The heading is
 * still read and the section is still there; opening it is one tap.
 */
export function Section({
  title,
  count,
  action,
  children,
  collapsible = false,
  initiallyOpen = true,
  style,
}: {
  title?: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  initiallyOpen?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(initiallyOpen || !collapsible);

  let heading: ReactNode = null;
  if (title && collapsible) {
    heading = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={count !== undefined ? `${title}, ${count}` : title}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          animateLayout();
          setOpen((value) => !value);
        }}
        hitSlop={8}
        style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
      >
        <View style={{ flex: 1 }}>
          <SectionHeader title={title} count={count} action={action} />
        </View>
        <Glyph name={open ? 'chevron-up' : 'chevron-down'} size={12} />
      </Pressable>
    );
  } else if (title) {
    heading = <SectionHeader title={title} count={count} action={action} />;
  }

  return (
    <View style={[cardStyle(theme), { gap: theme.spacing.md }, style]}>
      {heading}
      {open ? children : null}
    </View>
  );
}

/**
 * The bar pinned to the bottom of a screen that holds its primary action.
 *
 * On a long detail page the action is the reason for being there, and it should not be the
 * thing at the far end of a scroll. The bar sits above the home indicator and carries a
 * hairline and a faint lift so the content scrolling under it stays legible.
 */
export function StickyActionBar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: theme.spacing.sm,
        paddingBottom: Math.max(insets.bottom, theme.spacing.md),
        paddingHorizontal: theme.spacing.screen,
        paddingTop: theme.spacing.md,
        ...theme.shadow.raised,
      }}
    >
      {note}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {children}
      </View>
    </View>
  );
}

/** A flexible slot in a row of buttons, so two or three share the width evenly. */
export function Grow({ children }: { children: ReactNode }) {
  return <View style={{ flexBasis: 0, flexGrow: 1, minWidth: 120 }}>{children}</View>;
}

/** The top of a detail screen: an overline, a title and whatever states it is in. */
export function Hero({
  overline,
  title,
  children,
}: {
  overline?: string | null;
  title: string;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.xs }}>
      {overline ? (
        <AppText variant="label" tone="muted" uppercase numberOfLines={1}>
          {overline}
        </AppText>
      ) : null}
      <AppText variant="title">{title}</AppText>
      {children}
    </View>
  );
}

/**
 * How far a `KeyboardAvoidingView` under a stack header has to lift its content on iOS: the
 * status bar plus the header. Android resizes the window itself.
 */
export function useStackKeyboardOffset(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.top + TOUCH_TARGET : 0;
}
