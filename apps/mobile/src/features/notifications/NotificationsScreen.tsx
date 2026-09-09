import type { NotificationSummary } from '@ashniva/types';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { apiRequest, errorMessage } from '../../shared/api/client';
import { AppText, Button, Card, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useInbox } from './notifications-api';

/**
 * What needs your attention.
 *
 * Tapping a row marks it read and follows its link. Rows are marked read on the server rather
 * than locally so the badge agrees across the phone and the web — a notification you dismissed on
 * one should not still be waiting on the other.
 */
export function NotificationsScreen({ onOpenLink }: { onOpenLink: (link: string) => void }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const inbox = useInbox();

  const items = inbox.items;
  const unread = inbox.unreadCount;
  const loading = inbox.isLoading;
  const error = inbox.error;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const open = async (item: NotificationSummary) => {
    if (!item.readAt) {
      try {
        await apiRequest(`/notifications/${item.id}/read`, { method: 'POST' });
      } catch {
        // Reading a notification is not worth an error dialog; the link still opens.
      }
    }
    if (item.link) {
      onOpenLink(item.link);
    }
    void invalidate();
  };

  const markAll = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      await invalidate();
    } catch {
      // The badge stays as it was; the next refresh will pick it up.
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState label="Loading your notifications" />
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(error)}
          offline={error instanceof Error && error.name === 'NetworkError'}
          onRetry={inbox.refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {unread > 0 ? (
        <View style={{ padding: theme.spacing.lg, paddingBottom: 0 }}>
          <Button
            label={`Mark all ${unread} as read`}
            variant="secondary"
            onPress={() => void markAll()}
          />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isRefreshing}
            onRefresh={inbox.refresh}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={inbox.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <EmptyState title="Nothing waiting" description="You are up to date." />
        }
        ListFooterComponent={
          inbox.isLoadingMore ? <LoadingState label="Loading older notifications" /> : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.title}
            accessibilityHint={item.link ? 'Opens the related screen' : 'Marks it read'}
            onPress={() => void open(item)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card style={item.readAt ? undefined : { borderColor: theme.colors.primary }}>
              <AppText weight={item.readAt ? 'regular' : 'medium'}>{item.title}</AppText>
              {item.body ? (
                <AppText size="sm" tone="muted" numberOfLines={3}>
                  {item.body}
                </AppText>
              ) : null}
              {item.groupedCount > 1 ? (
                <AppText size="xs" tone="faint">
                  and {item.groupedCount - 1} more like this
                </AppText>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
