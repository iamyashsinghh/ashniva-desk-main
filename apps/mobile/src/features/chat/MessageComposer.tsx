import {
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  mentionsIn,
  type CommunicationRefusal,
  type MentionableUser,
  type MessageSummary,
} from '@ashniva/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  type NativeSyntheticEvent,
  type TextInput,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import { useMentionable } from './chat-api';
import { newClientMessageId } from './client-message-id';
import { ComposerBar } from './ComposerBar';
import { useComposerAttachments, useSendMessage } from './composer-hooks';
import {
  AttachmentStrip,
  ComposerClosed,
  ComposerNotices,
  PrivateNotice,
  SendFailure,
} from './ComposerControls';
import {
  activeMention,
  draftToBody,
  insertMention,
  mentionSearchTerm,
  type MentionDraft,
} from './mention-draft';
import { withMentionsAsPlainText } from './mention-refusal';
import { MentionSuggestions } from './MentionSuggestions';
import { ReplyPreview } from './ReplyPreview';

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
  /** The message being answered: the send carries its id as `replyToId`. */
  replyingTo?: MessageSummary | null;
  onCancelReply?: () => void;
  /** A group, where tagging somebody makes the message private to them. */
  tagsArePrivate?: boolean;
  /** Names for the mentions in the message being answered. */
  names?: ReadonlyMap<string, string>;
  /** The reader, so the reply bar says "You" over their own line. */
  viewerId?: string | null;
  /** The home indicator's height, filled with the composer's own colour. */
  bottomInset?: number;
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

export function MessageComposer({
  conversationId,
  canPost,
  reason,
  onSent,
  replyingTo = null,
  onCancelReply,
  tagsArePrivate = false,
  names = NO_NAMES,
  viewerId = null,
  bottomInset = 0,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [mentionOpen, setMentionOpen] = useState(true);

  /**
   * The id this draft is being sent under.
   *
   * Created on the first attempt and kept until one succeeds, so a retry is the same send. Cleared
   * on success and whenever the draft — its words or its files — changes, because anything but a
   * retry risks the server answering with the earlier message and clearing what was not sent.
   */
  const sendId = useRef<string | null>(null);

  /**
   * The people picked into the draft, by id.
   *
   * The field shows their names; this is what turns those names back into mentions when the
   * message is sent (`draftToBody`), names who was refused, and is emptied when the mentions are
   * sent as plain text so the resend does not tag anyone.
   *
   * State rather than a ref because the refusal sentence is *rendered* from it.
   */
  const [mentionNames, setMentionNames] = useState<ReadonlyMap<string, string>>(new Map());

  const mention = mentionOpen ? activeMention(draft, caret) : null;
  const audience = useMentionable(conversationId, mentionSearchTerm(mention), mention !== null);

  const files = useComposerAttachments(() => {
    sendId.current = null;
  });
  const send = useSendMessage(conversationId, () => {
    sendId.current = null;
    setDraft('');
    setCaret(0);
    files.clear();
    setMentionNames(new Map());
    onCancelReply?.();
    onSent?.();
  });

  // Answering somebody else is a different message, so it is sent under a different key. Choosing
  // a reply also puts the caret in the field, because answering is why the person chose it.
  const field = useRef<TextInput>(null);
  const replyId = replyingTo?.id ?? null;
  useEffect(() => {
    sendId.current = null;
    if (replyId) {
      field.current?.focus();
    }
  }, [replyId]);

  const onChangeText = useCallback((text: string) => {
    setDraft(text);
    // The caret goes to the end of what was just typed, and `onSelectionChange` corrects it a
    // moment later for the less common case of an edit in the middle. Without this the picker
    // depends entirely on a selection event arriving, and a keyboard that does not send one —
    // or a change made any way but typing — leaves the `@` unnoticed.
    setCaret(text.length);
    // A new draft is a new message, so it gets a new id; only a retry of the same text reuses one.
    sendId.current = null;
    setMentionOpen(true);
  }, []);

  const onSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
      setCaret(event.nativeEvent.selection.end),
    [],
  );

  const chooseMention = (person: MentionableUser, at: MentionDraft) => {
    const next = insertMention(draft, at, person.name);
    setMentionNames((current) => new Map(current).set(person.userId, person.name));
    setDraft(next.text);
    setCaret(next.caret);
    sendId.current = null;
    setMentionOpen(false);
  };

  const body = draftToBody(draft.trim(), mentionNames);
  const tooLong = body.length > MAX_MESSAGE_LENGTH;
  const canSend =
    !tooLong && !send.busy && !files.busy && (body.length > 0 || files.files.length > 0);
  const goesPrivate = tagsArePrivate && mentionsIn(body).length > 0;

  const submit = (text: string) => {
    sendId.current ??= newClientMessageId();
    void send.run({
      body: text,
      attachmentIds: files.files.map((file) => file.id),
      clientMessageId: sendId.current,
      // No mention of the person answered in the body: the server notifies them for the reply.
      replyToId: replyingTo?.id ?? null,
    });
  };

  /**
   * The same words again with the mentions as plain names — which is what the field already shows,
   * so what is sent is what the sender sees. The key is kept: a refusal means nothing was stored
   * under it.
   */
  const sendWithMentionsAsPlainText = () => {
    submit(withMentionsAsPlainText(body, mentionNames));
    setMentionNames(new Map());
  };

  if (!canPost) {
    return <ComposerClosed reason={reason} bottomInset={bottomInset} />;
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

      <ComposerBar
        attachDisabled={files.busy || files.files.length >= MAX_MESSAGE_ATTACHMENTS}
        onAttachPhoto={files.attachPhoto}
        onAttachCamera={files.attachCamera}
        onAttachFile={files.attachFile}
        bottomInset={bottomInset}
        fieldRef={field}
        field={{
          accessibilityLabel: 'Your message',
          placeholder: replyingTo ? 'Reply' : 'Message',
          value: draft,
          onChangeText,
          onSelectionChange,
        }}
        sendBusy={send.busy}
        sendDisabled={!canSend}
        onSend={() => submit(body)}
      >
        {replyingTo ? (
          <ReplyPreview
            replyingTo={replyingTo}
            names={names}
            viewerId={viewerId}
            onCancel={() => onCancelReply?.()}
          />
        ) : null}
        {files.files.length > 0 ? (
          <AttachmentStrip files={files.files} onRemove={files.remove} />
        ) : null}

        <SendFailure
          error={send.error}
          cause={send.cause}
          body={body}
          names={mentionNames}
          onSendWithoutMentions={sendWithMentionsAsPlainText}
        />
        {goesPrivate ? <PrivateNotice /> : null}
        <ComposerNotices attachError={files.error} length={body.length} />
      </ComposerBar>
    </View>
  );
}
