import type { MessagePage, MessageSummary } from '@ashniva/types';
import type { InfiniteData } from '@tanstack/react-query';

/**
 * Putting an arriving message into a thread that is already on screen.
 *
 * The realtime provider refetches the thread on every `conversation.message` anyway — the web
 * app's approach, because what may be done to a message is answered per viewer and the event does
 * not carry it. That refetch walks every loaded page, one request each, so on a long thread the new
 * line would appear seconds after the event said it existed. Splicing it in first closes that gap;
 * the refetch then replaces it with the server's own copy.
 *
 * The splice is safe to show because the fan-out payload is built with no abilities — `canEdit`
 * and `canDelete` arrive false — so the one thing it could get wrong is to *withhold* an Edit
 * control for a moment on the reader's own line sent from another device. It never offers one the
 * server would refuse.
 */
export function appendLiveMessage(
  data: InfiniteData<MessagePage> | undefined,
  message: MessageSummary,
): InfiniteData<MessagePage> | undefined {
  // Nothing loaded yet: the first fetch will bring it, and inventing a page here would claim a
  // history of one message.
  if (!data || data.pages.length === 0) {
    return data;
  }
  if (data.pages.some((page) => page.items.some((item) => item.id === message.id))) {
    return data;
  }
  const [newest, ...older] = data.pages as [MessagePage, ...MessagePage[]];
  // Page 0 is the newest window and is oldest-first inside itself, so the new line goes last.
  return { ...data, pages: [{ ...newest, items: [...newest.items, message] }, ...older] };
}

/**
 * The server's own answer to this viewer's send or edit, written into the thread.
 *
 * Unlike a socket splice, this copy carries the viewer's abilities, so it *replaces* a copy already
 * there rather than deferring to it: the fan-out of the viewer's own send usually lands before the
 * POST returns, with `canEdit: false`, and keeping that one would hide Edit until the refetch.
 */
export function upsertMessage(
  data: InfiniteData<MessagePage> | undefined,
  message: MessageSummary,
): InfiniteData<MessagePage> | undefined {
  if (!data) {
    return data;
  }
  const replaced = replaceWhere(data, message.id, () => message);
  return replaced ?? appendLiveMessage(data, message);
}

/**
 * Somebody else's edit or withdrawal, arriving over the socket.
 *
 * The payload is built for everybody at once, so two things in it are not this viewer's: it has no
 * abilities, and a quote of a tagged-private original arrives as `unavailable` even to somebody
 * who may read it. The abilities already held are kept — an edit of the reader's own line from
 * another device must not take their Edit control away — and so is a quote they could already see.
 */
export function applyLiveChange(
  data: InfiniteData<MessagePage> | undefined,
  message: MessageSummary,
): InfiniteData<MessagePage> | undefined {
  if (!data) {
    return data;
  }
  return (
    replaceWhere(data, message.id, (existing) => ({
      ...message,
      canEdit: existing.canEdit && !message.deletedAt,
      canDelete: existing.canDelete && !message.deletedAt,
      replyTo:
        message.replyTo?.unavailable && existing.replyTo && !existing.replyTo.unavailable
          ? existing.replyTo
          : (message.replyTo ?? existing.replyTo ?? null),
    })) ?? data
  );
}

/**
 * The thread, oldest first, with each message once.
 *
 * Page 0 is the newest window and each page is oldest-first inside itself, so the pages are read
 * in reverse. A message can briefly sit in two pages — a splice into page 0 racing a refetch that
 * moved the page boundary — and a list keyed by message id must never be handed the same key
 * twice, so the first copy of an id wins.
 */
export function threadMessages(data: InfiniteData<MessagePage> | undefined): MessageSummary[] {
  const seen = new Set<string>();
  const messages: MessageSummary[] = [];
  for (const page of [...(data?.pages ?? [])].reverse()) {
    for (const item of page.items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        messages.push(item);
      }
    }
  }
  return messages;
}

/** Whether a write's response is a message of this conversation, safe to put into its thread. */
export function isMessageOf(value: unknown, conversationId: string): value is MessageSummary {
  const candidate = value as Partial<MessageSummary> | null;
  return (
    typeof candidate?.id === 'string' &&
    candidate.conversationId === conversationId &&
    typeof candidate.createdAt === 'string'
  );
}

function replaceWhere(
  data: InfiniteData<MessagePage>,
  id: string,
  next: (existing: MessageSummary) => MessageSummary,
): InfiniteData<MessagePage> | null {
  let found = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some((item) => item.id === id)) {
      return page;
    }
    found = true;
    return { ...page, items: page.items.map((item) => (item.id === id ? next(item) : item)) };
  });
  return found ? { ...data, pages } : null;
}
