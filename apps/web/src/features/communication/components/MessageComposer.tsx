import {
  COMMUNICATION_REFUSAL_LABELS,
  MAX_MESSAGE_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  type CommunicationRefusal,
  type MessageSummary,
} from '@ashniva/types';
import { Alert, Button } from '@ashniva/ui';
import { useId, useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useComposerAttachments } from './composer-attachments';
import { useComposerMentions } from './composer-mentions';
import { useComposerSend, type SendMessageDraft } from './composer-send';
import { grow } from './composer-textarea';
import { withMentionsAsPlainText } from './mention-refusal';
import { MentionPicker } from './MentionPicker';

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
  onSend: (input: SendMessageDraft) => Promise<void>;
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
  onSend,
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
  const mentions = useComposerMentions(conversationId, textarea);
  const listboxId = useId();

  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_MESSAGE_LENGTH;
  const canSubmit =
    canPost && !sending.busy && !tooLong && (trimmed.length > 0 || attachments.files.length > 0);

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

  /**
   * The body as it will be sent.
   *
   * A reply is delivered as an address rather than as a thread: the API has no `replyToId`, so
   * naming the person is the only way to answer one line of a busy channel that the notification
   * path will actually carry.
   */
  function bodyToSend(): string {
    return replyingTo?.sender ? `@[${replyingTo.sender.id}] ${trimmed}`.trim() : trimmed;
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
    const ok = await sending.attempt(
      bodyToSend(),
      attachments.files.map((file) => file.id),
      mentions.names,
    );
    if (ok) {
      landed();
    }
  }

  /** The same words, with the refused mention written out as a name instead of a token. */
  async function submitWithoutMentions() {
    const body = withMentionsAsPlainText(bodyToSend(), mentions.names);
    // Kept in the box as well, so that what is being sent is what the sender can see. The send key
    // is kept with it: the refusal happened before the row was written, so this is that same
    // message going out once, not a second one.
    apply(withMentionsAsPlainText(draft, mentions.names), true);
    const ok = await sending.attempt(
      body,
      attachments.files.map((file) => file.id),
      mentions.names,
    );
    if (ok) {
      landed();
    }
  }

  return (
    <div className="chat-composer">
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
        <div className="chat-composer__reply">
          <span className="chat-composer__reply-text">
            <strong>Replying to {replyingTo.sender?.name ?? 'somebody'}</strong>
            <span className="timeline__note">{replyingTo.body}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Cancel this reply"
            onClick={() => onCancelReply?.()}
          >
            ×
          </Button>
        </div>
      ) : null}

      {attachments.files.length > 0 ? (
        <ul className="chat-composer__files">
          {attachments.files.map((file) => (
            <li key={file.id}>
              <span className="chat-composer__file-name">{file.name}</span>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={`Remove ${file.name}`}
                onClick={() => attachments.remove(file.id)}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
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
          placeholder={
            canPost ? 'Write a message. Type @ to mention somebody.' : 'You cannot post here'
          }
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

        {draft.length > 0 ? (
          <span className={tooLong ? 'form-error' : 'chat-composer__count'} aria-live="polite">
            {draft.length} / {MAX_MESSAGE_LENGTH}
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
