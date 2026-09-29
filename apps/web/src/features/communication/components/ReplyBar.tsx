import type { ConversationAudienceMember, MessageSummary } from '@ashniva/types';
import { Button } from '@ashniva/ui';

import { QuoteText } from './MessageQuote';
import { attachmentHint, namesOf } from './reply-quote';

export interface ReplyBarProps {
  replyingTo: MessageSummary;
  audience: readonly ConversationAudienceMember[];
  onCancel: () => void;
}

/**
 * The message the next send answers, pinned above the composer.
 *
 * The body is clamped by CSS rather than cut here, so the whole of it is still in the document for
 * a screen reader and only the eye is spared a paragraph.
 */
export function ReplyBar({ replyingTo, audience, onCancel }: ReplyBarProps) {
  const who = replyingTo.sender?.name ?? 'somebody';
  const hasWords = replyingTo.body.trim().length > 0;
  const fileCount = replyingTo.attachments.length;

  return (
    <div className="chat-composer__reply" role="group" aria-label={`Replying to ${who}`}>
      <span className="chat-composer__reply-text">
        <strong className="chat-quote__sender">Replying to {who}</strong>
        {hasWords ? (
          <span className="chat-quote__text">
            <QuoteText text={replyingTo.body} names={namesOf(audience)} />
          </span>
        ) : null}
        {fileCount > 0 ? (
          <span className="timeline__note">
            {attachmentHint(fileCount, replyingTo.attachments)}
          </span>
        ) : null}
      </span>
      <Button variant="ghost" size="sm" iconOnly aria-label="Cancel this reply" onClick={onCancel}>
        ×
      </Button>
    </div>
  );
}
