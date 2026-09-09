import {
  COMMUNICATION_REFUSAL_LABELS,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  type CommunicationRefusal,
  type FileSummary,
  type MentionableUser,
  type MessageSummary,
} from '@ashniva/types';
import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import {
  pickDocument,
  pickImage,
  uploadAttachment,
  UNPARENTED,
  type PickedFile,
} from '../../shared/attachments/attachments';
import { AppText, Button, Input } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { conversationKeys, useMentionable } from './chat-api';
import { newClientMessageId } from './client-message-id';
import { AttachmentStrip, IconAction, SendFailure } from './ComposerControls';
import {
  activeMention,
  insertMention,
  mentionSearchTerm,
  type MentionDraft,
} from './mention-draft';
import { withMentionsAsPlainText } from './mention-refusal';
import { MentionSuggestions } from './MentionSuggestions';

/**
 * Writing a message.
 *
 * **The typed text is never lost.** Everything the composer does on a failure — a refused mention,
 * a dropped connection, an oversized attachment — leaves the draft exactly as it was, with a
 * sentence above it and the send button live again. A composer that clears on an error is a
 * composer that eats a paragraph somebody typed on a train.
 *
 * **A retry cannot post twice.** Every send carries a `clientMessageId`, and it is held in a ref
 * from the first attempt until one succeeds: a retry presents the *same* id, and the API returns
 * the message the first attempt created rather than posting a second copy. Generating the id at
 * the moment of the press — which is what this screen used to do — makes a retry a new send, so
 * the failure it exists to survive is exactly the one that duplicates the message. The id itself
 * is a uuid (`client-message-id.ts`) because the DTO bounds it at 64 characters and the shape this
 * used to build could exceed that — a 400 the held key then repeated on every retry.
 *
 * **A refused mention is recoverable.** The API answers a mention of somebody outside the
 * conversation's audience with a 400 rather than dropping it silently, which is the right
 * behaviour and needs somewhere to land: the composer names that person and offers to send the
 * same text with the mentions written out as ordinary names. Nothing is sent without the person
 * pressing that, and a 400 about something else does not get the offer — see `mention-refusal.ts`.
 */
export interface MessageComposerProps {
  conversationId: string;
  canPost: boolean;
  /** Why not, when the server refused. Rendered instead of the composer, in the API's own words. */
  reason: CommunicationRefusal | null;
  onSent?: () => void;
}

export function MessageComposer({ conversationId, canPost, reason, onSent }: MessageComposerProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [attachments, setAttachments] = useState<FileSummary[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(true);

  /**
   * The id this draft is being sent under.
   *
   * Created on the first attempt and kept until one succeeds, so a retry is the same send. Cleared
   * on success and whenever the draft changes, because the next thing typed is a different message.
   *
   * **The files are part of the draft**, so attaching or removing one clears it too. Only a *retry*
   * of the same words and the same files reuses a key; anything else would risk the server
   * answering with the earlier message and the composer clearing what has not been sent.
   */
  const sendId = useRef<string | null>(null);

  /**
   * The names behind the mention tokens in the draft.
   *
   * The picker is the only place on this screen where an id is paired with a name, so it is where
   * the pairing is remembered — for the two moments it is needed: naming who was refused, and
   * rewriting the token as plain text. A token this map has forgotten degrades to `@someone`.
   *
   * State rather than a ref because the refusal sentence is *rendered* from it.
   */
  const [mentionNames, setMentionNames] = useState<ReadonlyMap<string, string>>(new Map());

  const mention = mentionOpen ? activeMention(draft, caret) : null;
  const audience = useMentionable(conversationId, mentionSearchTerm(mention), mention !== null);

  const send = useApiMutation<
    { body: string; attachmentIds: string[]; clientMessageId: string },
    MessageSummary
  >({
    path: `/conversations/${conversationId}/messages`,
    body: (variables) => ({
      body: variables.body,
      clientMessageId: variables.clientMessageId,
      ...(variables.attachmentIds.length > 0 ? { attachmentIds: variables.attachmentIds } : {}),
    }),
    invalidate: conversationKeys(conversationId),
    onSuccess: () => {
      sendId.current = null;
      setDraft('');
      setAttachments([]);
      onSent?.();
    },
  });

  const onChangeText = useCallback((text: string) => {
    setDraft(text);
    // The caret goes to the end of what was just typed, and `onSelectionChange` corrects it a
    // moment later for the less common case of an edit in the middle. Without this the picker
    // depends entirely on a selection event arriving, and a keyboard that does not send one —
    // or a change made any way but typing — leaves the `@` unnoticed.
    setCaret(text.length);
    // A new draft is a new message, so it gets a new id. Only a *retry* of the same text reuses
    // one — which is the whole point of holding it.
    sendId.current = null;
    setMentionOpen(true);
  }, []);

  const onSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
      setCaret(event.nativeEvent.selection.end),
    [],
  );

  const pick = async (picker: () => Promise<PickedFile | null>) => {
    setAttachError(null);
    setAttaching(true);
    try {
      const file = await picker();
      if (!file) {
        // The picker was opened and dismissed. Nothing changed, so the key stands.
        return;
      }
      // A different set of files is a different message, exactly as different words are — and the
      // sharper case: the first send landed carrying nothing, and this is the file it should have
      // carried. Reusing the key would answer with that first message and clear the strip.
      sendId.current = null;
      // No parent: the message adopts the file when it is sent. See `AttachmentTarget`.
      const uploaded = await uploadAttachment(file, UNPARENTED);
      setAttachments((current) => [...current, uploaded]);
    } catch (cause) {
      setAttachError(errorMessage(cause));
    } finally {
      setAttaching(false);
    }
  };

  const chooseMention = (person: MentionableUser, at: MentionDraft) => {
    const next = insertMention(draft, at, person.userId);
    setMentionNames((current) => new Map(current).set(person.userId, person.name));
    setDraft(next.text);
    setCaret(next.caret);
    sendId.current = null;
    setMentionOpen(false);
  };

  const body = draft.trim();
  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const canSend =
    !tooLong && !send.busy && !attaching && (body.length > 0 || attachments.length > 0);

  const submit = (text: string) => {
    sendId.current ??= newClientMessageId();
    void send.run({
      body: text,
      attachmentIds: attachments.map((file) => file.id),
      clientMessageId: sendId.current,
    });
  };

  /**
   * The same words again, with the refused mention written out as a name.
   *
   * The draft is rewritten too, so what is being sent is what the sender can see. The key is
   * deliberately kept: the audience is checked before the row is written, so a refusal means
   * nothing was stored under it, and re-presenting it is one message sent once.
   */
  const sendWithMentionsAsPlainText = () => {
    setDraft(withMentionsAsPlainText(draft, mentionNames));
    submit(withMentionsAsPlainText(body, mentionNames));
  };

  if (!canPost) {
    return (
      <View
        style={{
          borderColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          padding: theme.spacing.lg,
        }}
      >
        <AppText size="sm" tone="muted">
          {reason ? COMMUNICATION_REFUSAL_LABELS[reason] : 'You cannot post here.'}
        </AppText>
      </View>
    );
  }

  return (
    <View>
      {mention ? (
        <MentionSuggestions
          people={audience.items}
          isLoading={audience.isLoading}
          onPick={(person) => chooseMention(person, mention)}
          onDismiss={() => setMentionOpen(false)}
        />
      ) : null}

      <View
        style={{
          borderColor: theme.colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
        }}
      >
        {attachments.length > 0 ? (
          <AttachmentStrip
            files={attachments}
            onRemove={(id) => {
              setAttachments((current) => current.filter((file) => file.id !== id));
              sendId.current = null;
            }}
          />
        ) : null}

        <SendFailure
          error={send.error}
          cause={send.cause}
          body={body}
          names={mentionNames}
          onSendWithoutMentions={sendWithMentionsAsPlainText}
        />
        {attachError ? (
          <AppText tone="danger" size="sm">
            {attachError}
          </AppText>
        ) : null}
        {tooLong ? (
          <AppText tone="danger" size="sm">
            {draft.length} of {MAX_MESSAGE_LENGTH} characters. Shorten it to send.
          </AppText>
        ) : null}

        <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: theme.spacing.sm }}>
          <IconAction
            label="Attach a photo"
            glyph="＋"
            disabled={attaching || attachments.length >= MAX_MESSAGE_ATTACHMENTS}
            onPress={() => void pick(pickImage)}
          />
          <IconAction
            label="Attach a file"
            glyph="📎"
            disabled={attaching || attachments.length >= MAX_MESSAGE_ATTACHMENTS}
            onPress={() => void pick(pickDocument)}
          />
          <View style={{ flex: 1 }}>
            <Input
              accessibilityLabel="Your message"
              placeholder="Message"
              multiline
              value={draft}
              onChangeText={onChangeText}
              onSelectionChange={onSelectionChange}
              // Grows with the text and then scrolls, so the keyboard is never pushed off and a
              // long message never takes the whole screen.
              style={{ maxHeight: 120, paddingTop: theme.spacing.sm, textAlignVertical: 'top' }}
            />
          </View>
          <View style={{ minWidth: 88 }}>
            <Button
              label="Send"
              loading={send.busy}
              disabled={!canSend}
              accessibilityHint="Sends the message to this conversation"
              onPress={() => submit(body)}
            />
          </View>
        </View>
      </View>
    </View>
  );
}
