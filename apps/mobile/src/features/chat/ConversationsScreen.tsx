import type { ConversationSummary } from '@ashniva/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, View, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../shared/api/client';
import { Button, Input, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useConversationList } from './chat-api';
import { ConversationRow } from './ConversationRow';
import { CONVERSATION_FILTER, inboxFiltersFor, type ConversationFilter } from './conversation-filters';
import { FilterChips } from './FilterChips';

/**
 * Your conversations.
 *
 * One column, one request per window, and nothing that asks about a conversation one at a time:
 * every field a row draws is on the summary the list endpoint returned, and a per-row fetch is
 * the N+1 the backend spent work removing. The one extra request the screen makes is for the
 * unread notifications, which is where a mention badge can be known from — see `useUnreadMentions`
 * — and it is one request for the whole list rather than one per row.
 *
 * **There is a "new conversation" button, and there did not used to be.** Every conversation used
 * to be attached to a project, a task or a ticket, so it was opened from the thing it was about.
 * That is still true of those kinds. A direct message and a group are attached to *people*, and
 * there is nowhere else in the app to start one from.
 *
 * Refreshed when the screen comes back into view rather than held open on a socket. See
 * `chat-api.ts` for why the first release polls.
 */

export interface ConversationsScreenProps {
  onOpen: (conversationId: string) => void;
  /** Opens the "start a conversation" screen. Absent for somebody with no internal chat at all. */
  onStart?: () => void;
  /**
   * Managers and leads see people and Direct. Developers only see the project team group.
   * Defaults on so existing tests of the people inbox keep their Direct chip.
   */
  personalChat?: boolean;
}

export function ConversationsScreen({ onOpen, onStart, personalChat = true }: ConversationsScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>(CONVERSATION_FILTER.ALL);

  const list = useConversationList(filter, search, personalChat);
  const { refresh } = list;

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Stable across renders, so `ConversationRow`'s memo actually holds while somebody scrolls.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ConversationSummary>) => (
      <ConversationRow row={item} mentioned={list.mentioned.has(item.id)} onOpen={onOpen} />
    ),
    [list.mentioned, onOpen],
  );
  const keyExtractor = useCallback((row: ConversationSummary) => row.id, []);

  if (list.isLoading) {
    return (
      <Screen>
        <LoadingState label="Loading your conversations" />
      </Screen>
    );
  }

  if (list.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(list.error)}
          offline={list.error instanceof Error && list.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={list.items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
          // The home indicator sits over the last row otherwise.
          paddingBottom: theme.spacing.lg + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
        refreshing={list.isRefreshing}
        onRefresh={refresh}
        // Widen the window before the person reaches the bottom rather than after: a list that
        // stops dead and then loads is a list that felt broken for half a second.
        onEndReachedThreshold={0.4}
        onEndReached={list.loadMore}
        // Windowed rendering. The defaults keep about ten screens of rows mounted, which on a
        // hundred-row list is a hundred mounted cards; these keep it to a few screens either way.
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.sm }}>
            {onStart ? (
              <Button
                label="New conversation"
                accessibilityHint="Start a direct message or a group"
                onPress={onStart}
              />
            ) : null}
            <Input
              accessibilityLabel="Search your conversations"
              placeholder="Search conversations"
              value={search}
              onChangeText={setSearch}
            />
            <FilterChips
              value={filter}
              onChange={setFilter}
              filters={inboxFiltersFor(personalChat)}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyList filter={filter} searching={search.trim().length > 0} personalChat={personalChat} />
        }
        ListFooterComponent={
          list.isLoadingMore ? (
            <View style={{ paddingVertical: theme.spacing.lg }}>
              <ActivityIndicator
                accessibilityLabel="Loading more conversations"
                color={theme.colors.primary}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

/**
 * Nothing to show, and why.
 *
 * Three different reasons, because "No conversations" under an active filter is a lie about the
 * account rather than an answer about the filter.
 */
function EmptyList({
  filter,
  searching,
  personalChat,
}: {
  filter: ConversationFilter;
  searching: boolean;
  personalChat: boolean;
}) {
  if (searching) {
    return <EmptyState title="Nothing matches" description="Try a different search." />;
  }
  if (filter !== CONVERSATION_FILTER.ALL) {
    return (
      <EmptyState
        title="Nothing here"
        description="Nothing under this filter. Try All to see everything you are in."
      />
    );
  }
  return (
    <EmptyState
      title={personalChat ? 'No conversations' : 'No team group yet'}
      description={
        personalChat
          ? 'Start a direct message or a group with anybody on your projects and teams.'
          : 'The group for your project team will show up here. You can write there, not in a private chat.'
      }
    />
  );
}
