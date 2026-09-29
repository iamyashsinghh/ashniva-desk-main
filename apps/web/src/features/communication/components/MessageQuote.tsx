import {
  splitMentions,
  type ConversationAudienceMember,
  type MessageReplyRef,
} from '@ashniva/types';

import { attachmentHint, namesOf } from './reply-quote';

/** A body preview with `@[uuid]` written as the person's name, as `MessageBody` does it. */
export function QuoteText({ text, names }: { text: string; names: ReadonlyMap<string, string> }) {
  return (
    <>
      {splitMentions(text).map((part, index) =>
        part.kind === 'text' ? (
          part.text
        ) : (
          <span key={index} className="chat-mention">
            {`@${names.get(part.userId) ?? 'someone'}`}
          </span>
        ),
      )}
    </>
  );
}

export interface MessageQuoteProps {
  replyTo: MessageReplyRef;
  audience: readonly ConversationAudienceMember[];
  /** Scrolls to the original. Absent where there is no thread to scroll, as in a unit test. */
  onJump?: (messageId: string) => void;
}

/**
 * The line a reply answers, quoted inside the reply's bubble.
 *
 * Everything drawn comes from `replyTo` as the server built it for this reader: an original they
 * may not read arrives as `unavailable` with no sender and no words, and is drawn as exactly that —
 * and not as a button, because there is nothing in their thread for it to lead to.
 */
export function MessageQuote({ replyTo, audience, onJump }: MessageQuoteProps) {
  if (replyTo.unavailable) {
    return (
      <div className="chat-quote chat-quote--muted">
        <span className="chat-quote__text">Message unavailable</span>
      </div>
    );
  }

  const who = replyTo.sender?.name ?? 'Somebody';
  let content;
  if (replyTo.deleted) {
    content = <em>This message was withdrawn</em>;
  } else if (replyTo.bodyPreview.trim().length > 0) {
    content = <QuoteText text={replyTo.bodyPreview} names={namesOf(audience)} />;
  } else {
    content = attachmentHint(replyTo.attachmentCount);
  }

  return (
    <button
      type="button"
      className={`chat-quote${replyTo.deleted ? ' chat-quote--muted' : ''}`}
      aria-label={`Show the message from ${who} this replies to`}
      onClick={() => onJump?.(replyTo.id)}
    >
      <strong className="chat-quote__sender">{who}</strong>
      <span className="chat-quote__text">{content}</span>
    </button>
  );
}
