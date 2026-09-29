import type { MessageSummary } from '@ashniva/types';
import { memo, useCallback, type MutableRefObject } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { BubbleActions, MessageRevisions } from './BubbleActions';
import { BubbleSurface } from './BubbleSurface';
import { MessageEditor } from './MessageEditor';
import { canReplyTo } from './MessageActionSheet';
import { bubbleAccessibilityLabel } from './message-labels';
import { SwipeToReply } from './SwipeToReply';
import type { MessageRow } from './thread-rows';

/**
 * One message, as a bubble.
 *
 * **Own on the right, everybody else's on the left**, which is the one convention every phone
 * chat shares and the one thing a reader should not have to work out from a name. Whose it is
 * comes from `isOwn`, which `thread-rows` derives from the session's own user id — not from a
 * colour, and not from the sender's name matching.
 *
 * The sender's name appears on the first line of a run and only in a conversation with more than
 * two people in it: in a direct message the other person is named at the top of the screen and
 * repeating it above every line is noise.
 *
 * A withdrawn message keeps its place — the row is soft-deleted so the conversation still reads
 * correctly — and says so rather than vanishing and leaving a reply to nothing.
 *
 * **Edit is drawn from `message.canEdit`, and from nothing else.** The server answers it per
 * message on every read — the sender, inside the fifteen-minute window — because the answer
 * differs between two lines of the same thread. Nothing here recomputes it.
 *
 * **There is no delete control here, for anybody** — nor on the web. `DELETE` refuses everyone
 * without `conversation:inspect`, the sender included.
 *
 * **An edit in progress is not held here.** The thread renders these in a windowed list that
 * unmounts rows it has scrolled past, so `MessageThread` holds both the id of the message being
 * edited and the words typed into it; this passes them through.
 */
export interface MessageBubbleProps {
  row: MessageRow;
  /** Whether the sender's name is worth drawing: true for a group or a channel, false for a pair. */
  showSenderNames: boolean;
  names: ReadonlyMap<string, string>;
  viewerId: string | null;
  /** True when this is the message the thread has open for editing. */
  isEditing: boolean;
  /** The thread's hold on what has been typed, so it outlives this row. Passed straight through. */
  editingDraftRef: MutableRefObject<string | null>;
  /** Asks the thread to open this message for editing. */
  onEdit: (messageId: string) => void;
  /** Finished editing — the save landed, or it was cancelled. */
  onDoneEditing: () => void;
  /** What the in-thread search is looking for, lowercased. */
  highlight?: string;
  /** Answers this message in the composer. Absent where the reader cannot post. */
  onReply?: ((message: MessageSummary) => void) | undefined;
  /** Opens the edit history. Only given to somebody reading on oversight. */
  onShowRevisions?: ((messageId: string) => void) | undefined;
  revisionsOpen?: boolean;
  /** Opens the message's action sheet. */
  onLongPress?: ((message: MessageSummary, isOwn: boolean) => void) | undefined;
  /** Goes to the message a reply quotes. */
  onOpenQuote?: ((messageId: string) => void) | undefined;
  /** True for a moment after somebody jumped here from a quote. */
  flashing?: boolean;
}

export const MessageBubble = memo(function MessageBubble({
  row,
  showSenderNames,
  names,
  viewerId,
  isEditing,
  editingDraftRef,
  onEdit,
  onDoneEditing,
  highlight = '',
  onReply,
  onShowRevisions,
  revisionsOpen = false,
  onLongPress,
  onOpenQuote,
  flashing = false,
}: MessageBubbleProps) {
  const theme = useTheme();
  const { message, isOwn, isSystem } = row;
  // Stable while the message is: the swipe's responder is memoised on it, and one rebuilt mid-drag
  // loses the gesture. The thread's cache keeps an unchanged message the same object across
  // refetches, so only a real change to this line makes a new callback.
  const reply = useCallback(() => onReply?.(message), [onReply, message]);

  if (isSystem) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
        <AppText size="xs" tone="faint" align="center">
          {message.body}
        </AppText>
      </View>
    );
  }

  const senderName = message.sender?.name ?? 'Somebody';

  if (isEditing) {
    // The editor takes the bubble's place rather than sitting inside it: the bubble is one
    // `accessible` element with a sentence of its own, and a text field buried in one of those is
    // a text field a screen reader cannot reach.
    return (
      <View style={{ alignItems: 'stretch', paddingTop: row.isRunStart ? theme.spacing.sm : 2 }}>
        <MessageEditor
          message={message}
          names={names}
          draftRef={editingDraftRef}
          onDone={onDoneEditing}
        />
      </View>
    );
  }

  const replyable = canReplyTo(message, { onReply });
  const spokenActions = [
    ...(replyable ? [{ name: 'reply', label: 'Reply' }] : []),
    ...(message.canEdit && !message.deletedAt ? [{ name: 'edit', label: 'Edit' }] : []),
  ];

  return (
    <View
      style={{
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        // A brief wash behind a line somebody jumped to from a quote, so the eye lands on it.
        backgroundColor: flashing ? theme.colors.primarySoft : 'transparent',
        borderRadius: theme.radius.md,
      }}
    >
      {/* Never the full width: a bubble that reaches both edges is a paragraph, and the reader
          loses the left/right cue that says whose it is. The limit sits on the outermost
          shrink-wrapped box, so the percentage is of the row rather than of the bubble itself. */}
      <View style={{ maxWidth: '82%' }}>
        <SwipeToReply enabled={replyable} onReply={reply}>
          <Pressable
            accessible
            accessibilityLabel={bubbleAccessibilityLabel(row, senderName, names)}
            accessibilityHint={
              onLongPress && !message.deletedAt ? 'Long press for actions' : undefined
            }
            accessibilityActions={spokenActions}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'reply') {
                reply();
              } else if (event.nativeEvent.actionName === 'edit') {
                onEdit(message.id);
              }
            }}
            onLongPress={
              onLongPress && !message.deletedAt ? () => onLongPress(message, isOwn) : undefined
            }
            delayLongPress={280}
            style={({ pressed }) => ({
              alignItems: isOwn ? 'flex-end' : 'flex-start',
              gap: 2,
              opacity: pressed && onLongPress ? 0.85 : 1,
              paddingTop: row.isRunStart ? theme.spacing.md : 2,
            })}
          >
            {row.showSender && showSenderNames && !isOwn ? (
              <View style={{ paddingHorizontal: theme.spacing.md }}>
                <AppText size="xs" weight="medium" tone="muted">
                  {senderName}
                </AppText>
              </View>
            ) : null}
            <BubbleSurface
              message={message}
              isOwn={isOwn}
              isRunEnd={row.isRunEnd}
              names={names}
              viewerId={viewerId}
              highlight={highlight}
              onOpenQuote={onOpenQuote}
            />
          </Pressable>
        </SwipeToReply>
      </View>

      {revisionsOpen ? <MessageRevisions message={message} /> : null}
      <BubbleActions
        message={message}
        onEdit={onEdit}
        onShowRevisions={onShowRevisions}
        revisionsOpen={revisionsOpen}
      />
    </View>
  );
});
