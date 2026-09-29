import type { MessagingScopeContact } from '@ashniva/types';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, View, type ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorMessage } from '../../shared/api/client';
import { Banner, ListFooterLoader } from '../../shared/components/feedback';
import { Divider, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MENTION_DEBOUNCE_MS, useConversationList, useDebounced } from './chat-api';
import { AVATAR_SIZE, ConversationRow, PersonRow } from './ConversationRow';
import {
  CONVERSATION_FILTER,
  serverQueryFor,
  type ConversationFilter,
} from './conversation-filters';
import { inboxEntryKey, mergeInbox, unreadChipCount, type InboxEntry } from './inbox';
import { InboxEmpty } from './InboxEmpty';
import { InboxHeader } from './InboxHeader';
import { OversightInbox } from './OversightInbox';
import { useMessagingDirectory, useOpenDirectMessage } from './scope-api';

/**
 * Your conversations, and the people you may start one with.
 *
 * The web's inbox on a phone: existing threads first, then everybody the directory says this
 * person may reach, the Unread chip's figure, and — for somebody holding `conversation:inspect` —
 * the audited administrator view. One request for the window of threads and one for the
 * directory; nothing asks about a conversation one at a time, because every field a row draws is
 * on the summary the list endpoint returned.
 *
 * **The spinner is only for a pull.** The list refetches whenever the tab comes back into view,
 * and on iOS a refresh control told to spin by code rather than by a finger leaves the scroll view
 * offset down the screen — which is how the search bar ended up half-way down the tab. The
 * focus refetch is silent; only a pull shows the spinner.
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
  /** `conversation:inspect`. Offers the administrator view; the API refuses it to anyone else. */
  canInspect?: boolean;
}

export function ConversationsScreen({
  onOpen,
  onStart,
  personalChat = true,
  canInspect = false,
}: ConversationsScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ConversationFilter>(CONVERSATION_FILTER.ALL);
  const [oversight, setOversight] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const list = useConversationList(filter, search, personalChat);
  const settledSearch = useDebounced(search, MENTION_DEBOUNCE_MS);
  const directory = useMessagingDirectory(settledSearch, personalChat && !oversight);
  const openDirect = useOpenDirectMessage();
  const { refresh } = list;

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const needle = search.trim().toLowerCase();
  const entries = useMemo(
    () =>
      mergeInbox(
        list.window,
        personalChat ? (directory.data ?? []) : [],
        filter,
        needle,
        personalChat,
      ),
    [list.window, directory.data, filter, needle, personalChat],
  );
  const unread = unreadChipCount(list.window, serverQueryFor(filter), personalChat);

  const pull = () => {
    setPulling(true);
    void Promise.all([refresh(), personalChat ? directory.refetch() : null]).finally(() =>
      setPulling(false),
    );
  };

  const { run: startDirect } = openDirect;
  const openPerson = useCallback(
    async (contact: MessagingScopeContact) => {
      if (contact.conversationId) {
        onOpen(contact.conversationId);
        return;
      }
      setOpeningId(contact.id);
      const opened = await startDirect({ userId: contact.id });
      setOpeningId(null);
      if (opened) {
        onOpen(opened.id);
      }
    },
    [onOpen, startDirect],
  );

  // Stable across renders, so the rows' memo actually holds while somebody scrolls.
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<InboxEntry>) =>
      item.type === 'thread' ? (
        <ConversationRow
          row={item.row}
          mentioned={list.mentioned.has(item.row.id)}
          onOpen={onOpen}
        />
      ) : (
        <PersonRow
          contact={item.contact}
          opening={openingId === item.contact.id}
          onOpen={(contact) => void openPerson(contact)}
        />
      ),
    [list.mentioned, onOpen, openingId, openPerson],
  );

  let body: ReactNode;
  if (oversight) {
    body = <OversightInbox onOpen={onOpen} />;
  } else if (list.isLoading) {
    body = <LoadingState label="Loading your conversations" />;
  } else if (list.error) {
    body = (
      <ErrorState
        message={errorMessage(list.error)}
        offline={list.error instanceof Error && list.error.name === 'NetworkError'}
        onRetry={() => void refresh()}
      />
    );
  } else {
    body = (
      <FlatList
        data={entries}
        keyExtractor={inboxEntryKey}
        renderItem={renderItem}
        contentContainerStyle={{
          flexGrow: 1,
          // The home indicator sits over the last row otherwise.
          paddingBottom: theme.spacing.lg + insets.bottom,
        }}
        // Flat rows on the screen itself, split by a hairline that starts where the text does:
        // an inbox is read by scanning names down one edge, and a card per row breaks that edge.
        ItemSeparatorComponent={RowSeparator}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={pulling} onRefresh={pull} tintColor={theme.colors.primary} />
        }
        // Widen the window before the person reaches the bottom rather than after: a list that
        // stops dead and then loads is a list that felt broken for half a second.
        onEndReachedThreshold={0.4}
        onEndReached={list.loadMore}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        ListEmptyComponent={
          <InboxEmpty filter={filter} searching={needle.length > 0} personalChat={personalChat} />
        }
        ListFooterComponent={
          list.isLoadingMore ? <ListFooterLoader label="Loading more conversations" /> : null
        }
      />
    );
  }

  return (
    <Screen>
      <InboxHeader
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        personalChat={personalChat}
        unreadCount={unread}
        onStart={onStart}
        oversight={oversight}
        onToggleOversight={canInspect ? () => setOversight((on) => !on) : undefined}
      />
      {openDirect.error ? (
        <View style={{ paddingHorizontal: theme.spacing.screen, paddingBottom: theme.spacing.sm }}>
          <Banner tone="danger" role="alert">
            {openDirect.error}
          </Banner>
        </View>
      ) : null}
      {body}
    </Screen>
  );
}

function RowSeparator() {
  const theme = useTheme();
  return <Divider inset={theme.spacing.screen + AVATAR_SIZE + theme.spacing.md} />;
}
