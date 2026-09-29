import {
  COMMUNICATION_REFUSAL_LABELS,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  mentionsIn,
  type CommunicationRefusal,
  type ConversationAudienceMember,
  type MessageSummary,
} from '@ashniva/types';
import { Alert, Button } from '@ashniva/ui';
import { useEffect, useId, useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useComposerAttachments } from './composer-attachments';
import { ComposerFiles } from './ComposerFiles';
import { useComposerMentions } from './composer-mentions';
import { useComposerSend, type SendMessageDraft } from './composer-send';
import { grow } from './composer-textarea';
import { withMentionsAsPlainText } from './mention-refusal';
import { useMentionSearch } from './mention-search';
import { MentionPicker } from './MentionPicker';
import { ReplyBar } from './ReplyBar';

export type { SendMessageDraft } from './composer-send';

export interface MessageComposerProps {
  /** The conversation being written into, which is what the mention search is scoped to. */
  conversationId: string | undefined;
  canPost: boolean;
  /** Why not, when the server refused. Rendered under the composer rather than guessed at. */
  reason: CommunicationRefusal | null;
  /** The message being answered, when somebody pressed Reply. */
  replyingTo?: MessageSummary | null;
  onCancelReply?: () => void;
  /** The roster, so mentions in the line being answered read as names. */
  audience?: readonly ConversationAudienceMember[];
  onSend: (input: SendMessageDraft) => Promise<void>;
  /** Corner messenger: short placeholder, no character counter crowding the bar. */
  compact?: boolean;
  /** A group, where tagging somebody makes the message private to them. */
  tagsArePrivate?: boolean;
}

/**
 * Writing a message: one line high until there is more than one line to hold.
 *
 * **It admits how long a message may be.** `MAX_MESSAGE_LENGTH` is four thousand characters and the
 * API refuses more; the counter appears once something is written rather than sitting under an
 * empty box.
 *
 * **It writes mentions.** `@` opens a picker fed by `GET /conversations/:id/mentionable`, which is
 * the same audience the send path refuses a forged mention against — so a name it offers is a name
 * the API will accept. What goes into the body is `@[uuid]`, the grammar the notification path
 * dispatches on, and the arrow keys move the picker without the caret ever leaving the sentence.
 *
 * **A mention can still go stale between choosing it and sending.** Somebody leaves the project in
 * the seconds in between and the send comes back 400. That is not an error to shout about: the
 * message is fine and only its address is not, so the composer says who can no longer be reached
 * and offers to send the same words with the mention written out as a plain name. Nothing anybody
 * typed is discarded on any path through this component.
 *
 * Enter sends and shift+Enter makes a new line, which is what everybody's fingers already expect
 * from every other chat.
 */
export function MessageComposer({
  conversationId,
  canPost,
  reason,
  replyingTo,
  onCancelReply,
  audience = [],
  onSend,
  compact = false,
  tagsArePrivate = false,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  // Declared before the attachments, which hand it their own changes.
  const sending = useComposerSend(onSend);
  const attachments = useComposerAttachments(
    filePicker,
    (cause) => setAttachmentError(errorMessage(cause)),
    // Attaching or removing a file changes the message, so it changes the key it is sent under.
    sending.draftChanged,
  );
  const mentionSearch = useMentionSearch(conversationId);
  const mentions = useComposerMentions(mentionSearch, textarea);
  const listboxId = useId();
  const replyToId = replyingTo?.id;

  useEffect(() => {
    sending.draftChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the reply target moves.
  }, [replyToId]);

  const trimmed = mentions.toBody(draft.trim());
  const tooLong = trimmed.length > MAX_MESSAGE_LENGTH;
  const canSubmit =
    canPost && !sending.busy && !tooLong && (trimmed.length > 0 || attachments.files.length > 0);
  const goesPrivate = tagsArePrivate && mentionsIn(trimmed).length > 0;
  let placeholder = 'You cannot post here';
  if (canPost) {
    placeholder = compact ? 'Aa' : 'Write a message. Type @ to mention somebody.';
  }

  /**
   * The draft, replaced wholesale — by choosing a mention, or by the one rewrite below.
   *
   * `keepSendKey` marks the rewrite the composer performs on the sender's behalf (a refused mention
   * written out as a plain name), which is the same message and must keep its key. Everything else
   * here is somebody changing what they wrote, and a changed draft is a different message.
   */
  function apply(value: string, keepSendKey = false) {
    setDraft(value);
    mentions.noteDraft(value);
    grow(textarea.current);
    if (!keepSendKey) {
      sending.draftChanged();
    }
  }

  function landed() {
    setDraft('');
    mentions.noteDraft('');
    attachments.clear();
    mentions.search.setTerm(null);
    onCancelReply?.();
    grow(textarea.current, true);
  }

  async function submit() {
    if (!canSubmit) {
      return;
    }
    // A reply names the message it answers rather than the person: the server tells the original's
    // sender the way it tells somebody mentioned, so the words stay the sender's own.
    const ok = await sending.attempt(
      trimmed,
      attachments.files.map((file) => file.id),
      mentions.names,
      replyToId,
    );
    if (ok) {
      landed();
    }
  }

  /** The same words, with the refused mention written out as a name instead of a token. */
  async function submitWithoutMentions() {
    const body = withMentionsAsPlainText(trimmed, mentions.names);
    // The box already shows the names, so what is sent is what the sender can see; forgetting the
    // picks keeps a retry from tagging them again. The send key is kept: the refusal happened
    // before the row was written, so this is that same message going out once, not a second one.
    const names = mentions.names;
    mentions.forget();
    const ok = await sending.attempt(
      body,
      attachments.files.map((file) => file.id),
      names,
      replyToId,
    );
    if (ok) {
      landed();
    }
  }

  return (
    <div className={`chat-composer${compact ? ' chat-composer--dock' : ''}`}>
      {attachmentError ? (
        <Alert tone="danger" onDismiss={() => setAttachmentError(undefined)}>
          {attachmentError}
        </Alert>
      ) : null}

      {sending.failure ? (
        <Alert
          tone={sending.failure.kind === 'mention' ? 'warning' : 'danger'}
          action={
            sending.failure.kind === 'mention' ? (
              <Button size="sm" onClick={() => void submitWithoutMentions()}>
                Send without the mention
              </Button>
            ) : (
              <Button size="sm" onClick={() => void submit()}>
                Retry
              </Button>
            )
          }
        >
          {sending.failure.message}
        </Alert>
      ) : null}

      {replyingTo ? (
        <ReplyBar replyingTo={replyingTo} audience={audience} onCancel={() => onCancelReply?.()} />
      ) : null}

      <ComposerFiles files={attachments.files} onRemove={attachments.remove} />

      {goesPrivate ? (
        <p className="chat-composer__private" role="status">
          Private message: only the people you tag, Super Admins and Project Managers will see it.
        </p>
      ) : null}

      {mentions.search.isOpen ? (
        <MentionPicker
          query={mentions.search.term ?? ''}
          people={mentions.search.people}
          isLoading={mentions.search.isLoading}
          hasMore={mentions.search.hasMore}
          activeIndex={mentions.search.activeIndex}
          idPrefix={listboxId}
          onChoose={(person) =>
            apply(mentions.insert(person, textarea.current?.selectionStart ?? draft.length))
          }
        />
      ) : null}

      <div className="chat-composer__bar">
        <input
          ref={filePicker}
          type="file"
          className="sr-only"
          aria-label="Choose a file to attach"
          onChange={(event) => void attachments.attach(event.target.files?.[0])}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          loading={attachments.uploading}
          aria-label="Attach a file"
          disabled={!canPost || attachments.files.length >= MAX_MESSAGE_ATTACHMENTS}
          disabledReason={`A message carries at most ${MAX_MESSAGE_ATTACHMENTS} files`}
          onClick={attachments.open}
        >
          <span aria-hidden="true">＋</span>
        </Button>

        <textarea
          ref={textarea}
          rows={1}
          className="chat-composer__input"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          aria-label="Write a message"
          placeholder={placeholder}
          disabled={!canPost}
          role="combobox"
          aria-expanded={mentions.search.isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          {...(mentions.search.isOpen && mentions.search.people.length > 0
            ? { 'aria-activedescendant': `${listboxId}-${mentions.search.activeIndex}` }
            : {})}
          onChange={(event) => {
            setDraft(event.target.value);
            // Every keystroke, because the next thing sent is only a retry while the words are
            // still the ones that failed.
            sending.draftChanged();
            grow(textarea.current);
            mentions.reactToDraft(
              event.target.value,
              event.target.selectionStart ?? event.target.value.length,
            );
          }}
          onKeyDown={(event) => {
            const handled = mentions.handleKey(event);
            if (handled !== null) {
              event.preventDefault();
              if (handled !== 'handled') {
                apply(handled);
              }
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />

        {draft.length > 0 && !compact ? (
          <span className={tooLong ? 'form-error' : 'chat-composer__count'} aria-live="polite">
            {trimmed.length} / {MAX_MESSAGE_LENGTH}
          </span>
        ) : null}

        <Button
          variant="primary"
          size="sm"
          iconOnly
          aria-label="Send"
          loading={sending.busy}
          disabled={!canSubmit}
          disabledReason={reason ? COMMUNICATION_REFUSAL_LABELS[reason] : 'Write something first'}
          onClick={() => void submit()}
        >
          <span aria-hidden="true">➤</span>
        </Button>
      </div>
    </div>
  );
}
