import type { ConversationDetail, MessageSummary } from '@ashniva/types';
import { useState } from 'react';

/**
 * The first message the reader had not seen when they opened the thread.
 *
 * Taken from their own read cursor — `lastReadAt` on their participant row, which is the same
 * value the unread count is computed from — rather than from a count, so the line lands between
 * the right two messages rather than N from the end.
 *
 * Their own messages never start the unread run: posting a line is not a way to have an unread
 * message, and a divider that appears above something you wrote yourself is nonsense.
 *
 * The caller is expected to freeze the result at open. Opening a conversation marks it read a
 * moment later, and a divider that recomputes would vanish while somebody was still looking at it.
 */
export function firstUnreadMessageId(
  messages: readonly MessageSummary[],
  viewerId: string,
  lastReadAt: string | null,
): string | null {
  if (!lastReadAt) {
    // Never opened. Everything somebody else wrote is unread, so the divider goes at the very top
    // only when there is something above it to divide — which the thread decides by not drawing a
    // line above its own first message.
    return messages.find((message) => isFrom(message, viewerId) === false)?.id ?? null;
  }
  const readAt = Date.parse(lastReadAt);
  return (
    messages.find((message) => !isFrom(message, viewerId) && Date.parse(message.createdAt) > readAt)
      ?.id ?? null
  );
}

function isFrom(message: MessageSummary, viewerId: string): boolean {
  return message.sender?.id === viewerId;
}

/**
 * The divider, worked out once per conversation and then held still.
 *
 * Opening a thread marks it read a moment later — that is what `POST /conversations/:id/read` is
 * for — so a divider recomputed on every render would flash into view and vanish before anybody
 * could use it. This freezes the answer at the first render that has both halves: the messages,
 * and the reader's own cursor from the conversation detail.
 *
 * The freeze is state adjusted *during* the render that first has the data, rather than in an
 * effect. React documents this pattern for exactly this shape of problem — a value derived from
 * props that must then stop following them — and it is the honest one here: an effect would paint
 * the thread once without the divider and once with it, which is the flash the freeze exists to
 * avoid.
 */
export function useFrozenUnreadMarker(
  conversationId: string,
  messages: readonly MessageSummary[],
  viewerId: string,
  conversation: ConversationDetail | undefined,
): string | null {
  const [frozen, setFrozen] = useState<{ conversationId: string; marker: string | null } | null>(
    null,
  );

  if (frozen?.conversationId !== conversationId && conversation && messages.length > 0) {
    const mine = conversation.participants.find((person) => person.id === viewerId);
    setFrozen({
      conversationId,
      // The server's own count decides whether there is anything to divide; the cursor decides
      // where. No participant row means no read cursor has ever been written for this person
      // here, which is the same thing as never having opened it.
      marker:
        conversation.unreadCount > 0
          ? firstUnreadMessageId(messages, viewerId, mine?.lastReadAt ?? null)
          : null,
    });
  }

  return frozen?.conversationId === conversationId ? frozen.marker : null;
}
