import { dayHeading } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/** The pieces of a thread that are not messages: day headings, the unread line, the jump. */

export function DaySeparator({ day, startedAt }: { day: string; startedAt: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.md }}>
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.pill,
          flexDirection: 'row',
          gap: 5,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 3,
        }}
      >
        <Icon name="calendar-outline" size={11} color={theme.colors.textMuted} />
        {/* Dated from the day's first message rather than from its `YYYY-MM-DD` key: a bare date
            string parses as UTC midnight, which is the previous day west of Greenwich — the exact
            off-by-one the grouping went to the trouble of avoiding. */}
        <AppText size="xs" tone="muted" weight="medium">
          {dayHeading(day) ?? formatDate(startedAt) ?? day}
        </AppText>
      </View>
    </View>
  );
}

/** Where the reader stopped last time. Drawn once, and it does not move while they read. */
export function UnreadDivider({ count }: { count: number }) {
  const theme = useTheme();
  const words = count > 0 ? `${count} new ${count === 1 ? 'message' : 'messages'}` : 'New messages';
  return (
    <View
      accessible
      accessibilityLabel={`${words} below`}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.md,
      }}
    >
      <View style={{ backgroundColor: theme.colors.primary, flex: 1, height: 1 }} />
      <AppText size="xs" weight="bold" tone="primary">
        {words}
      </AppText>
      <View style={{ backgroundColor: theme.colors.primary, flex: 1, height: 1 }} />
    </View>
  );
}

/** A passing word over the top of the thread — why a tap on a quote went nowhere. */
export function ThreadNotice({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        alignItems: 'center',
        left: 0,
        position: 'absolute',
        right: 0,
        top: theme.spacing.sm,
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.xs,
          ...theme.shadow.card,
        }}
      >
        <AppText size="sm" tone="muted">
          {text}
        </AppText>
      </View>
    </View>
  );
}

/**
 * Back to the newest message, for somebody who has scrolled up into history.
 *
 * Only drawn once they have: the inverted list already keeps a reader at the bottom as lines
 * arrive, and leaves one reading history exactly where they are — this is how they get back.
 */
export function JumpToLatest({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="box-none"
      style={{
        alignItems: 'center',
        bottom: theme.spacing.md,
        left: 0,
        position: 'absolute',
        right: 0,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Jump to latest"
        accessibilityHint="Scrolls to the newest message"
        onPress={onPress}
        style={({ pressed }) => ({
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.pill,
          borderWidth: 1,
          flexDirection: 'row',
          gap: theme.spacing.xs,
          minHeight: TOUCH_TARGET - 8,
          opacity: pressed ? 0.8 : 1,
          paddingHorizontal: theme.spacing.lg,
          ...theme.shadow.card,
        })}
      >
        <Icon name="arrow-down" size={14} color={theme.colors.primary} />
        <AppText size="sm" weight="medium" tone="primary">
          Jump to latest
        </AppText>
      </Pressable>
    </View>
  );
}
