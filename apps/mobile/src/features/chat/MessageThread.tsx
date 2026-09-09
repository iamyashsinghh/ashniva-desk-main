import { dayHeading, type MessageSummary, type UserRef } from '@ashniva/types';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, View, type ListRenderItemInfo } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MessageBubble } from './MessageBubble';
import { namesOf } from './MessageBody';
import { threadRows, type ThreadRow } from './thread-rows';

/**
 * A thread, as a windowed list.
 *
 * **Inverted, and that is the whole scrolling design.** An inverted `FlatList` renders index 0 at
 * the bottom, which buys three behaviours that are otherwise hand-rolled and fragile: the newest
 * message is where the list opens, a message arriving while somebody sits at the bottom slides
 * into view without a `scrollToEnd` call, and — the one that matters most — a message arriving
 * while somebody is reading *history* does not yank them anywhere, because the content grows at
 * the far end of the list rather than under their thumb. The alternative, a `ScrollView` with a
 * scroll-to-bottom effect, has to guess whether the reader is at the bottom, and guesses wrongly
 * exactly when the thread is busy.
 *
 * Inversion also makes `onEndReached` mean "reached the *top*", which is where older history
 * belongs, so paging backwards is the list's own idiom rather than a button.
 *
 * The days and runs come from `groupMessagesByDay` in `@ashniva/types` via `thread-rows` — the
 * same function the web app calls. Two screens drawing the same conversation should not each
 * decide which side of midnight a message fell on, and the phone is where that bites hardest: it
 * is the client most likely to be in a different timezone from the person who wrote the line.
 *
 * **The open edit is held here, not in the bubble** — both halves of it: which message is being
 * rewritten, and what has been typed into it. The list is windowed — `removeClippedSubviews` with
 * a `windowSize` of nine — so a row that scrolls far enough out is unmounted, and anything living
 * inside it goes too. A half-written correction disappearing because the thread moved is not a
 * failure anybody would report; it would just look like the phone lost it. Lifting only the id
 * would have brought the editor back empty, which is the same loss with a better-looking symptom.
 *
 * The text is a **ref**, not state: the thread never renders it, so recording a keystroke must not
 * re-render a list of message bubbles. It is cleared when an edit ends and when a different
 * message is opened, so an editor always opens on that message's own words. Only one message can
 * be open at a time, which is what somebody would expect in any case.
 *
 * What it renders is presentation only. Nothing here decides who may read anything; the messages
 * arrived through an endpoint that decided that, and a line the reader is not entitled to is a
 * line this component never receives.
 */
export interface MessageThreadProps {
  messages: readonly MessageSummary[];
  viewerId: string | null;
  /** Whoever the conversation lists, for resolving a mention to a name. */
  participants: readonly UserRef[];
  /** True where more than two people can write: a group, a channel, a task or ticket thread. */
  showSenderNames: boolean;
  /** How many were unread when the thread was opened. Draws the "new messages" line. */
  unreadCount: number;
  hasEarlier: boolean;
  isLoadingEarlier: boolean;
  onLoadEarlier: () => void;
  /**
   * Anything to sit between the newest message and the composer — the call panel.
   *
   * It goes there rather than at the top of the screen because it is an action, and an action on
   * a phone belongs where the thumb already is.
   */
  bottomSlot?: React.ReactElement | null;
}

export function MessageThread({
  messages,
  viewerId,
  participants,
  showSenderNames,
  unreadCount,
  hasEarlier,
  isLoadingEarlier,
  onLoadEarlier,
  bottomSlot = null,
}: MessageThreadProps) {
  const theme = useTheme();
  const names = useMemo(() => namesOf(participants), [participants]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  /** What has been typed into the open editor. See the note above for why this is a ref. */
  const editingDraftRef = useRef<string | null>(null);
  const startEditing = useCallback((messageId: string) => {
    // A different message opens on its own words, never on the last one's.
    editingDraftRef.current = null;
    setEditingMessageId(messageId);
  }, []);
  const stopEditing = useCallback(() => {
    editingDraftRef.current = null;
    setEditingMessageId(null);
  }, []);

  // Reversed once per change of the thread, not per render: the list is inverted, so index 0 has
  // to be the newest row. A row that should read *above* another therefore comes after it here.
  const rows = useMemo(
    () => threadRows(messages, { viewerId, unreadCount }).reverse(),
    [messages, viewerId, unreadCount],
  );

  const keyExtractor = useCallback((row: ThreadRow) => row.key, []);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ThreadRow>) => {
      if (item.kind === 'day') {
        return <DaySeparator day={item.day} startedAt={item.startedAt} />;
      }
      if (item.kind === 'unread') {
        return <UnreadDivider count={item.count} />;
      }
      return (
        <MessageBubble
          row={item}
          showSenderNames={showSenderNames}
          names={names}
          viewerId={viewerId}
          isEditing={item.message.id === editingMessageId}
          editingDraftRef={editingDraftRef}
          onEdit={startEditing}
          onDoneEditing={stopEditing}
        />
      );
    },
    [editingMessageId, names, showSenderNames, startEditing, stopEditing, viewerId],
  );

  return (
    <FlatList
      inverted
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      // The rows are memoised, and which one is being edited is not part of a row. Without this a
      // bubble would keep its old `isEditing` until something else about it changed.
      extraData={editingMessageId}
      contentContainerStyle={{ padding: theme.spacing.lg }}
      keyboardShouldPersistTaps="handled"
      // On an inverted list this is the top of the thread, which is where older history lives.
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasEarlier && !isLoadingEarlier) {
          onLoadEarlier();
        }
      }}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={9}
      removeClippedSubviews
      // Inverted, so these two are the other way round from how they read: the header is drawn
      // against index 0, which is the newest message at the bottom, and the footer is drawn past
      // the last row, which is the top of the thread.
      ListHeaderComponent={bottomSlot}
      ListFooterComponent={
        isLoadingEarlier ? (
          <View style={{ paddingVertical: theme.spacing.lg }}>
            <ActivityIndicator
              accessibilityLabel="Loading earlier messages"
              color={theme.colors.primary}
            />
          </View>
        ) : null
      }
    />
  );
}

function DaySeparator({ day, startedAt }: { day: string; startedAt: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.md }}>
      {/* Dated from the day's first message rather than from its `YYYY-MM-DD` key: a bare date
          string parses as UTC midnight, which is the previous day west of Greenwich — the exact
          off-by-one the grouping went to the trouble of avoiding. */}
      <AppText size="xs" tone="faint" weight="medium">
        {dayHeading(day) ?? formatDate(startedAt) ?? day}
      </AppText>
    </View>
  );
}

/** Where the reader stopped last time. Drawn once, and it does not move while they read. */
function UnreadDivider({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${count} new ${count === 1 ? 'message' : 'messages'} below`}
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <View style={{ backgroundColor: theme.colors.primary, flex: 1, height: 1 }} />
      <AppText size="xs" weight="medium">
        {count} new {count === 1 ? 'message' : 'messages'}
      </AppText>
      <View style={{ backgroundColor: theme.colors.primary, flex: 1, height: 1 }} />
    </View>
  );
}
