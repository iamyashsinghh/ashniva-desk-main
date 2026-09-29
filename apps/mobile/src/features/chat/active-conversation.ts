/**
 * Which conversation is on screen right now, if any.
 *
 * Module state rather than context, because the readers are not below the thread in the tree: the
 * message toasts are mounted once beside the navigator, and the local alert echo lives in the
 * notifications feature. Both need one answer — "is this person already looking at it?" — and a
 * card announcing a line that is sliding into view under their thumb is noise.
 *
 * Only ever set by `ConversationScreen` while it is focused, and cleared when it loses focus, so a
 * thread left open underneath another screen does not count as being read.
 */
let reading: string | null = null;

export function setReadingConversation(conversationId: string | null): void {
  reading = conversationId;
}

/** Clears the mark only if it is still this conversation's, so two screens cannot race. */
export function stopReadingConversation(conversationId: string): void {
  if (reading === conversationId) {
    reading = null;
  }
}

export function isReadingConversation(conversationId: string | null | undefined): boolean {
  return conversationId !== null && conversationId !== undefined && reading === conversationId;
}
