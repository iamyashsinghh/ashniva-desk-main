import { memo, type MutableRefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../shared/components/primitives';
import { formatTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MessageAttachments } from './MessageAttachments';
import { MessageBody } from './MessageBody';
import { MessageEditor } from './MessageEditor';
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
 * differs between two lines of the same thread. Nothing here recomputes it: a rule restated on a
 * phone is a rule that drifts from the one the API enforces, and it would be a worse copy anyway,
 * since the window is measured against the server's clock rather than this device's.
 *
 * **There is no delete control here, for anybody**, and that is not the same kind of decision.
 * `DELETE /conversations/:id/messages/:id` refuses everyone without `conversation:inspect`, the
 * sender included, with the same sentence a bystander gets: a message cannot be withdrawn once it
 * is sent. `canDelete` is therefore false for every person this app is built for, so a control
 * conditioned on it would never appear — and offering an ordinary reader a withdraw button that
 * only ever refuses would be worse than the honesty of not drawing one. Somebody holding
 * `conversation:inspect` moderates on the web, where the act is labelled as the administrative
 * one it is.
 *
 * **An edit in progress is not held here.** The thread renders these in a windowed list that
 * unmounts rows it has scrolled past, so anything kept inside a bubble is something the list may
 * throw away without anybody being told. `MessageThread` holds both the id of the message being
 * edited and the words typed into it; this passes them through. See the note there.
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
}: MessageBubbleProps) {
  const theme = useTheme();
  const { message, isOwn, isSystem } = row;

  if (isSystem) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xs }}>
        <AppText size="xs" tone="faint">
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
      <View
        style={{
          alignItems: 'stretch',
          paddingTop: row.isRunStart ? theme.spacing.sm : 2,
        }}
      >
        <MessageEditor message={message} draftRef={editingDraftRef} onDone={onDoneEditing} />
      </View>
    );
  }

  return (
    // Two wrappers rather than one, so that Edit sits *outside* the bubble. The bubble is a single
    // `accessible` element reading as one sentence, and a control inside one of those is a control
    // a screen reader cannot reach on its own.
    <View style={{ alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
      <View
        accessible
        accessibilityLabel={accessibilityLabelFor(row, senderName)}
        style={{
          alignItems: isOwn ? 'flex-end' : 'flex-start',
          paddingTop: row.isRunStart ? theme.spacing.sm : 2,
        }}
      >
        <View
          // Never the full width: a bubble that reaches both edges is a paragraph, and the reader
          // loses the left/right cue that says whose it is.
          style={{
            backgroundColor: isOwn ? theme.colors.primary : theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            gap: theme.spacing.xs,
            maxWidth: '85%',
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
          }}
        >
          {row.showSender && showSenderNames && !isOwn ? (
            <AppText size="xs" weight="medium" tone="muted">
              {senderName}
            </AppText>
          ) : null}

          {message.deletedAt ? (
            <AppText size="sm" tone={isOwn ? 'inverse' : 'muted'}>
              This message was withdrawn.
            </AppText>
          ) : (
            <>
              {message.body ? (
                <MessageBody
                  body={message.body}
                  names={names}
                  viewerId={viewerId}
                  onBrand={isOwn}
                />
              ) : null}
              <MessageAttachments files={message.attachments} />
            </>
          )}

          <AppText size="xs" tone={isOwn ? 'inverse' : 'faint'}>
            {formatTime(message.createdAt) ?? ''}
            {message.editedAt ? ' · edited' : ''}
          </AppText>
        </View>
      </View>

      {message.canEdit && !message.deletedAt ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit this message"
          accessibilityHint="Rewrites what this message says. What it said before is kept."
          hitSlop={8}
          onPress={() => onEdit(message.id)}
          style={({ pressed }) => ({
            justifyContent: 'center',
            minHeight: TOUCH_TARGET,
            opacity: pressed ? 0.7 : 1,
            paddingHorizontal: theme.spacing.xs,
          })}
        >
          <AppText size="xs" tone="muted">
            Edit
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
});

/** One sentence per bubble, so a screen reader is not read a name, a body and a time separately. */
function accessibilityLabelFor(row: MessageRow, senderName: string): string {
  const who = row.isOwn ? 'You' : senderName;
  const what = row.message.deletedAt ? 'withdrew a message' : `said ${row.message.body}`;
  const when = formatTime(row.message.createdAt) ?? '';
  return `${who} ${what}, ${when}`;
}
