import type { NotificationSummary } from '@ashniva/types';
import { memo } from 'react';
import { View } from 'react-native';

import { MetaLine } from '../../shared/components/badges';
import { PressableCard } from '../../shared/components/layout';
import { AppText } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { notificationIcon, notificationTypeLabel } from './notification-display';

/** One inbox row: what happened, what kind of thing it was, and when. */
export const NotificationRow = memo(function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationSummary;
  onOpen: (item: NotificationSummary) => void;
}) {
  const theme = useTheme();
  const unread = !item.readAt;
  const typeLabel = notificationTypeLabel(item.type);

  return (
    <PressableCard
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${typeLabel}`}
      accessibilityHint={item.link ? 'Opens the related screen' : 'Marks it read'}
      onPress={() => onOpen(item)}
      highlight={unread}
      chevron={Boolean(item.link)}
      icon={notificationIcon(item)}
      iconTone={unread ? 'primary' : 'neutral'}
    >
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppText weight={unread ? 'medium' : 'regular'} style={{ flex: 1 }}>
          {item.title}
        </AppText>
        {item.groupedCount > 1 ? (
          <View
            style={{
              backgroundColor: theme.colors.surfaceSunken,
              borderRadius: theme.radius.pill,
              paddingHorizontal: 6,
            }}
          >
            <AppText size="xs" tone="muted" tabular>
              ×{item.groupedCount}
            </AppText>
          </View>
        ) : null}
        {unread ? (
          <View
            style={{ backgroundColor: theme.colors.danger, borderRadius: 4, height: 8, width: 8 }}
          />
        ) : null}
      </View>
      {item.body ? (
        <AppText size="sm" tone="muted" numberOfLines={3}>
          {item.body}
        </AppText>
      ) : null}
      <View style={{ alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View
          style={{
            backgroundColor: theme.colors.pillBackground,
            borderRadius: theme.radius.pill,
            flexShrink: 1,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: 2,
          }}
        >
          <AppText size="xs" tone="muted" numberOfLines={1}>
            {typeLabel}
          </AppText>
        </View>
        <MetaLine icon="time-outline">{formatSince(item.createdAt)}</MetaLine>
      </View>
    </PressableCard>
  );
});
