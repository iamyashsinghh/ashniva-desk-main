import {
  dayHeading,
  groupMessagesByDay,
  splitMentions,
  type ConversationAudienceMember,
  type MessageRevisionSummary,
  type MessageSummary,
} from '@ashniva/types';
import { Button, Spinner } from '@ashniva/ui';
import { useMemo, useRef } from 'react';

import { formatDate } from '../../../shared/lib/format';
import { MessageItem } from './MessageItem';
import { useThreadScroll } from './thread-scroll';

export interface MessageThreadProps {
  messages: readonly MessageSummary[];
  viewerId: string;
  audience: readonly ConversationAudienceMember[];
  /** True in a group or a project channel, where "who said this" is not obvious from the side. */
  showSenderNames?: boolean;
  /** Where the reader's unread run begins, frozen at open. Null when they were up to date. */
  firstUnreadId?: string | null;
  /** What the in-thread search is looking for, lowercased. Empty means "not searching". */
  highlight?: string;
  /** Whether the server says there is more thread behind the oldest line held. */
  hasEarlier: boolean;
  isLoadingEarlier: boolean;
  onLoadEarlier: () => void;
  onEdit: (input: { messageId: string; body: string }) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onReply?: (message: MessageSummary) => void;
  onLoadRevisions?: (messageId: string) => Promise<MessageRevisionSummary[]>;
}

/**
 * The thread itself: days, runs, the unread line, and the scroll position a chat is expected to
 * hold.
 *
 * **Days and runs come from `packages/types`.** Where a date heading goes, and which consecutive
 * lines belong to one person, is `groupMessagesByDay` — the same function the phone calls, so the
 * two apps cannot disagree about which side of midnight a message fell on.
 *
 * **Long threads load incrementally and render lazily.** History arrives a page at a time through
 * the cursor the API has always returned, so opening a two-year-old channel fetches fifty lines
 * rather than all of them. What accumulates as somebody scrolls back is then bounded a second way:
 * each day section is a containment boundary with an estimated height, so the browser skips layout
 * and paint for the sections that are off screen. Both halves are needed — paging alone still ends
 * with thousands of nodes in the document once somebody has walked far enough back.
 *
 * **Scrolling is `useThreadScroll`'s subject**, and the live region is here: an incoming line is
 * announced politely once, by the last item, rather than by re-reading the whole thread.
 */
export function MessageThread({
  messages,
  viewerId,
  audience,
  showSenderNames = true,
  firstUnreadId = null,
  highlight = '',
  hasEarlier,
  isLoadingEarlier,
  onLoadEarlier,
  onEdit,
  onDelete,
  onReply,
  onLoadRevisions,
}: MessageThreadProps) {
  const sections = useMemo(() => groupMessagesByDay(messages), [messages]);
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = useThreadScroll(scroller, messages.at(-1)?.id, messages[0]?.id);
  const newest = messages.at(-1);
  const announcement =
    newest && newest.sender && newest.sender.id !== viewerId && !newest.deletedAt
      ? `${newest.sender.name}: ${maskedFor(newest, audience)}`
      : '';

  return (
    <div className="chat-thread__frame">
      {/* Announced once, politely, and only for a line somebody else wrote — a reader does not
          need their own message read back to them. Outside the scroller so that re-rendering the
          thread does not re-announce what is already on screen. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="chat-thread" ref={scroller} onScroll={scroll.onScroll}>
        {hasEarlier ? (
          <div className="chat-thread__earlier">
            <Button variant="ghost" size="sm" loading={isLoadingEarlier} onClick={onLoadEarlier}>
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {isLoadingEarlier && !hasEarlier ? <Spinner size="sm" /> : null}

        {sections.map((section) => (
          <section
            key={section.day}
            className="chat-day"
            aria-label={dayLabel(section.day, section.startedAt)}
          >
            <h3 className="chat-day__heading">
              <span>{dayLabel(section.day, section.startedAt)}</span>
            </h3>
            <ol className="chat-day__messages">
              {section.runs.map((run) =>
                run.messages.map((message, index) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    viewerId={viewerId}
                    audience={audience}
                    showSenderName={showSenderNames}
                    highlight={highlight}
                    // The line the reader had not reached. Drawn above the message rather than
                    // as its own row so it cannot be separated from it by a day heading.
                    startsUnread={message.id === firstUnreadId}
                    // Only the first line of a run carries the name and the time; the rest of the
                    // run is the same person still talking.
                    continuesRun={index > 0 && message.id !== firstUnreadId}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    {...(onReply ? { onReply } : {})}
                    {...(onLoadRevisions ? { onLoadRevisions } : {})}
                  />
                )),
              )}
            </ol>
          </section>
        ))}
      </div>

      {scroll.isAtBottom ? null : (
        <div className="chat-thread__jump">
          <Button variant="secondary" size="sm" onClick={scroll.scrollToBottom}>
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * "Today", "Yesterday", or the date — the same wording the phone uses.
 *
 * Dated from the day's first message rather than from its `YYYY-MM-DD` key: a bare date string
 * parses as UTC midnight, which is the previous day west of Greenwich — the exact off-by-one the
 * grouping went to the trouble of avoiding.
 */
function dayLabel(day: string, startedAt: string): string {
  return dayHeading(day) ?? formatDate(startedAt);
}

/**
 * What the live region says about a body that may contain mentions.
 *
 * The names are substituted where the roster has them, so an announcement reads as a sentence
 * rather than as a uuid spelled out character by character.
 */
function maskedFor(
  message: MessageSummary,
  audience: readonly ConversationAudienceMember[],
): string {
  const names = new Map(audience.map((person) => [person.id, person.name]));
  return splitMentions(message.body)
    .map((part) => (part.kind === 'text' ? part.text : `@${names.get(part.userId) ?? 'someone'}`))
    .join('');
}
