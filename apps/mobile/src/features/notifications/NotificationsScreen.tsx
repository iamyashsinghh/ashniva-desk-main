import type { NotificationSummary } from '@ashniva/types';
import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { ListFooterLoader } from '../../shared/components/feedback';
import { AppText, Button, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar, type TabOption } from '../../shared/components/TabBar';
import { linkForNotification } from '../../shared/notifications/notification-payload';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { NotificationRow } from './NotificationRow';
import { useInbox, useNotificationActions, type InboxFilter } from './notifications-api';
import { useCachedUnreadCount } from './use-cached-unread';
import { PullRefresh } from '../../shared/components/PullRefresh';

/**
 * What needs your attention.
 *
 * Unread first, as on the web: the list most people open this screen for. Tapping a row marks it
 * read and follows its link. Rows are marked read on the server rather than locally so the badge
 * agrees across the phone and the web — a notification you dismissed on one should not still be
 * waiting on the other.
 */
export function NotificationsScreen({ onOpenLink }: { onOpenLink: (link: string) => void }) {
  const theme = useTheme();
  const [filter, setFilter] = useState<InboxFilter>('unread');
  const inbox = useInbox(filter);
  const { markRead, markAllRead } = useNotificationActions();
  // The shared count, not this page's: it is the one the socket keeps current between refetches.
  const unread = useCachedUnreadCount();
  const [markingAll, setMarkingAll] = useState(false);

  const open = useCallback(
    (item: NotificationSummary) => {
      void markRead(item);
      const link = linkForNotification(item.link, item.type);
      if (link) {
        onOpenLink(link);
      }
    },
    [markRead, onOpenLink],
  );

  const readAll = async () => {
    setMarkingAll(true);
    try {
      await markAllRead();
    } finally {
      setMarkingAll(false);
    }
  };

  const options: TabOption<InboxFilter>[] = [
    { value: 'unread', label: 'Unread', icon: 'mail-unread-outline', count: unread },
    { value: 'all', label: 'All', icon: 'file-tray-full-outline' },
  ];

  return (
    <Screen>
      <TabBar
        options={options}
        value={filter}
        onChange={setFilter}
        accessibilityLabel="Which notifications"
      />
      {unread > 0 ? (
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.screen,
            paddingTop: theme.spacing.md,
          }}
        >
          <AppText size="sm" tone="muted">
            {unread === 1 ? '1 unread' : `${unread} unread`}
          </AppText>
          <Button
            label="Mark all read"
            variant="ghost"
            size="sm"
            icon="checkmark-done"
            loading={markingAll}
            onPress={() => void readAll()}
          />
        </View>
      ) : null}
      <InboxList
        filter={filter}
        inbox={inbox}
        onOpen={open}
        onShowAll={() => setFilter('all')}
        compactTop={unread > 0}
      />
    </Screen>
  );
}

function InboxList({
  filter,
  inbox,
  onOpen,
  onShowAll,
  compactTop,
}: {
  filter: InboxFilter;
  inbox: ReturnType<typeof useInbox>;
  onOpen: (item: NotificationSummary) => void;
  onShowAll: () => void;
  compactTop: boolean;
}) {
  const theme = useTheme();

  if (inbox.isLoading) {
    return <LoadingState label="Loading your notifications" />;
  }
  if (inbox.error && inbox.items.length === 0) {
    return (
      <ErrorState
        message={errorMessage(inbox.error)}
        offline={inbox.error instanceof Error && inbox.error.name === 'NetworkError'}
        onRetry={inbox.refresh}
      />
    );
  }

  return (
    <FlatList
      data={inbox.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{
        gap: theme.spacing.sm,
        padding: theme.spacing.screen,
        paddingTop: compactTop ? theme.spacing.sm : theme.spacing.screen,
      }}
      refreshControl={
        <PullRefresh
          busy={inbox.isRefreshing}
          onRefresh={inbox.refresh}
          tintColor={theme.colors.primary}
        />
      }
      onEndReached={inbox.loadMore}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={
        filter === 'unread' ? (
          <EmptyState
            title="You are all caught up"
            description="Nothing unread. Older notifications are under All."
            icon="notifications-off-outline"
            iconTone="success"
            action={{ label: 'Show all', onPress: onShowAll }}
          />
        ) : (
          <EmptyState
            title="No notifications yet"
            description="Anything that needs you will appear here."
            icon="notifications-off-outline"
          />
        )
      }
      ListFooterComponent={
        inbox.isLoadingMore ? <ListFooterLoader label="Loading older notifications" /> : undefined
      }
      renderItem={({ item }) => <NotificationRow item={item} onOpen={onOpen} />}
    />
  );
}
