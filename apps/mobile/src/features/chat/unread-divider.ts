import type { ConversationDetail, MessageSummary } from '@ashniva/types';
import { useState } from 'react';

import { unreadStartIndex } from './thread-rows';

/**
 * The first message the reader had not seen when they opened the thread.
 *
 * Taken from their own read cursor — `lastReadAt` on their participant row, the value the unread
 * count is computed from — the same rule the web app uses, so the line lands between the same two
 * messages on both. Their own messages never start the unread run: posting is not a way to have
 * an unread message.
 *
 * Null when nothing loaded is past the cursor.
 */
export function firstUnreadMessageId(
  messages: readonly MessageSummary[],
  viewerId: string | null,
  lastReadAt: string | null,
): string | null {
  const readAt = lastReadAt ? Date.parse(lastReadAt) : Number.NEGATIVE_INFINITY;
  const first = messages.find(
    (message) =>
      message.sender !== null &&
      message.sender.id !== viewerId &&
      Date.parse(message.createdAt) > readAt,
  );
  return first?.id ?? null;
}

export interface UnreadMarker {
  /** The message the divider sits above. Null for none. */
  messageId: string | null;
  /** How many the server said were unread at open, for the divider's words. */
  count: number;
}

const NO_MARKER: UnreadMarker = { messageId: null, count: 0 };

/**
 * The divider, worked out once and then held still.
 *
 * Opening a thread marks it read a moment later, and the thread keeps growing while it is open —
 * a divider recomputed on every render would vanish before anybody could use it, or walk down the
 * screen as messages arrived. So the answer is frozen at the first render that has both halves:
 * the messages, and the reader's own cursor from the conversation.
 *
 * State adjusted during render rather than in an effect: an effect would paint the thread once
 * without the divider and once with it, which is the flash the freeze exists to avoid.
 */
export function useFrozenUnreadMarker(
  messages: readonly MessageSummary[],
  viewerId: string | null,
  conversation: ConversationDetail | null,
): UnreadMarker {
  const [frozen, setFrozen] = useState<UnreadMarker | null>(null);

  if (frozen === null && conversation && messages.length > 0) {
    setFrozen(
      conversation.unreadCount > 0
        ? {
            messageId: markerFor(messages, viewerId, conversation),
            count: conversation.unreadCount,
          }
        : NO_MARKER,
    );
  }

  return frozen ?? NO_MARKER;
}

/**
 * The server's count decides whether there is anything to divide; the cursor decides where.
 *
 * A project, task or ticket thread may have no participant row for the reader — those rows are
 * read cursors, written on first open — and "no cursor" would put the line above everything
 * loaded. There the count is walked back from the newest instead, which lands on the boundary the
 * server drew, or on nothing if the unread run reaches past what is loaded.
 */
function markerFor(
  messages: readonly MessageSummary[],
  viewerId: string | null,
  conversation: ConversationDetail,
): string | null {
  const mine = conversation.participants.find((person) => person.id === viewerId);
  if (mine) {
    return firstUnreadMessageId(messages, viewerId, mine.lastReadAt);
  }
  const index = unreadStartIndex(messages, viewerId, conversation.unreadCount);
  return index === null ? null : (messages[index]?.id ?? null);
}
