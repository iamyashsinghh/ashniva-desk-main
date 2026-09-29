import type { MessageSummary, UserRef } from '@ashniva/types';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, View, type ListRenderItemInfo } from 'react-native';

import { ListFooterLoader } from '../../shared/components/feedback';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MessageActionSheet } from './MessageActionSheet';
import { MessageBubble } from './MessageBubble';
import { namesOf } from './MessageBody';
import { threadRows, type ThreadRow } from './thread-rows';
import { DaySeparator, JumpToLatest, ThreadNotice, UnreadDivider } from './ThreadMarkers';
import { useAnnounceArrivals } from './use-announce-arrivals';
import { useJumpToMessage } from './use-jump-to-message';
import { MAINTAIN_POSITION, useThreadScroll } from './use-thread-scroll';

/**
 * A thread, as a windowed list.
 *
 * **Inverted.** An inverted `FlatList` renders index 0 at the bottom, so the newest message is
 * where the list opens and one arriving slides in without a `scrollToEnd` call. Somebody reading
 * history is held where they are by `use-thread-scroll`; "Jump to latest" is how they get back.
 *
 * Inversion also makes `onEndReached` mean "reached the *top*", which is where older history
 * belongs, so paging backwards is the list's own idiom rather than a button.
 *
 * The days and runs come from `groupMessagesByDay` in `@ashniva/types` via `thread-rows` — the
 * same function the web app calls.
 *
 * **The open edit is held here, not in the bubble** — both halves of it: which message is being
 * rewritten, and what has been typed into it. The list is windowed — a `windowSize` of nine — so a
 * row that scrolls far enough out is unmounted, and anything living inside it goes too. The text
 * is a **ref**, not state: the thread never renders it, so recording a keystroke must not
 * re-render a list of message bubbles.
 *
 * What it renders is presentation only. Nothing here decides who may read anything; the messages
 * arrived through an endpoint that decided that.
 */
export interface MessageThreadProps {
  messages: readonly MessageSummary[];
  viewerId: string | null;
  /** Whoever the conversation lists, for resolving a mention to a name. */
  participants: readonly UserRef[];
  /** Everybody who may read it, from the server — names people the participant rows do not. */
  audience?: readonly UserRef[];
  /** True where more than two people can write: a group, a channel, a task or ticket thread. */
  showSenderNames: boolean;
  /** How many were unread when the thread was opened. Draws the "new messages" line. */
  unreadCount: number;
  /** The frozen place for that line. Absent: worked out from `unreadCount`. */
  firstUnreadId?: string | null;
  /** What the in-thread search is looking for, lowercased. */
  highlight?: string;
  hasEarlier: boolean;
  isLoadingEarlier: boolean;
  onLoadEarlier: () => void;
  /** Answers a message in the composer. Absent where the reader cannot post. */
  onReply?: (message: MessageSummary) => void;
  /** Offers each edited message's history. Only true for somebody reading on oversight. */
  canSeeRevisions?: boolean;
}

const NOBODY: readonly UserRef[] = [];

export function MessageThread({
  messages,
  viewerId,
  participants,
  audience = NOBODY,
  showSenderNames,
  unreadCount,
  firstUnreadId,
  highlight = '',
  hasEarlier,
  isLoadingEarlier,
  onLoadEarlier,
  onReply,
  canSeeRevisions = false,
}: MessageThreadProps) {
  const theme = useTheme();
  const names = useMemo(() => namesOf([...audience, ...participants]), [audience, participants]);
  const list = useRef<FlatList<ThreadRow>>(null);
  const { awayFromLatest, onScroll, jumpToLatest } = useThreadScroll(list, messages, viewerId);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [openRevisions, setOpenRevisions] = useState<ReadonlySet<string>>(new Set());
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
  const showRevisions = useCallback((messageId: string) => {
    setOpenRevisions((current) => new Set(current).add(messageId));
  }, []);
  // Held here rather than in the bubble for the same reason as the edit: the list may unmount it.
  const [actionsFor, setActionsFor] = useState<{ message: MessageSummary; isOwn: boolean } | null>(
    null,
  );
  const openActions = useCallback((message: MessageSummary, isOwn: boolean) => {
    setActionsFor({ message, isOwn });
  }, []);

  useAnnounceArrivals(messages, viewerId, names);

  // Reversed once per change of the thread, not per render: the list is inverted, so index 0 has
  // to be the newest row. A row that should read *above* another therefore comes after it here.
  const rows = useMemo(
    () =>
      threadRows(messages, {
        viewerId,
        unreadCount,
        ...(firstUnreadId !== undefined ? { firstUnreadId } : {}),
      }).reverse(),
    [messages, viewerId, unreadCount, firstUnreadId],
  );
  const jump = useJumpToMessage({ list, rows, hasEarlier, isLoadingEarlier, onLoadEarlier });
  const { jumpTo, flashId } = jump;

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
          highlight={highlight}
          onReply={onReply}
          onShowRevisions={canSeeRevisions ? showRevisions : undefined}
          revisionsOpen={openRevisions.has(item.message.id)}
          onLongPress={openActions}
          onOpenQuote={jumpTo}
          flashing={item.message.id === flashId}
        />
      );
    },
    [
      canSeeRevisions,
      editingMessageId,
      flashId,
      highlight,
      jumpTo,
      names,
      onReply,
      openActions,
      openRevisions,
      showRevisions,
      showSenderNames,
      startEditing,
      stopEditing,
      viewerId,
    ],
  );

  // The rows are memoised, and none of these is part of a row. Without this a bubble would keep
  // its old `isEditing`, highlight or history until something else about it changed.
  const extraData = useMemo(
    () => ({ editingMessageId, flashId, highlight, openRevisions }),
    [editingMessageId, flashId, highlight, openRevisions],
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        inverted
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={extraData}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.screen,
          paddingVertical: theme.spacing.md,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        maintainVisibleContentPosition={MAINTAIN_POSITION}
        onScroll={onScroll}
        scrollEventThrottle={100}
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
        // iOS draws blank rows with it on an inverted list whose rows change height as they load.
        removeClippedSubviews={Platform.OS === 'android'}
        onScrollToIndexFailed={jump.onScrollToIndexFailed}
        // Inverted, so the footer is drawn past the last row, which is the top of the thread.
        ListFooterComponent={
          isLoadingEarlier ? <ListFooterLoader label="Loading earlier messages" /> : null
        }
      />
      {awayFromLatest ? <JumpToLatest onPress={jumpToLatest} /> : null}
      {jump.notice ? <ThreadNotice text={jump.notice} /> : null}
      <MessageActionSheet
        message={actionsFor?.message ?? null}
        isOwn={actionsFor?.isOwn ?? false}
        names={names}
        actions={{
          onReply,
          onEdit: startEditing,
          onShowRevisions: canSeeRevisions ? showRevisions : undefined,
        }}
        onClose={() => setActionsFor(null)}
      />
    </View>
  );
}
