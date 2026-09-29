import { useEffect, useRef, useState, type RefObject } from 'react';

const FLASH_MS = 1600;
const NOTICE_MS = 4000;

export const NOT_LOADED_NOTICE =
  'That message is further back in the conversation. Load earlier messages to find it.';

/**
 * Following a quote back to the line it quotes.
 *
 * Only a line already in the document can be reached: the thread is paged from the newest end, and
 * fetching pages until the original turns up could walk a two-year-old channel for one click. So a
 * quote of something not loaded says so, briefly, and leaves the scroll position where it was.
 *
 * The target is found by comparing each row's `data-message-id` rather than by building a selector
 * from the id, so nothing the server sent is ever parsed as CSS.
 */
export function useReplyJump(scroller: RefObject<HTMLDivElement | null>) {
  const [flashId, setFlashId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function jumpTo(messageId: string) {
    clearTimeout(timer.current);
    const rows = scroller.current?.querySelectorAll<HTMLElement>('[data-message-id]') ?? [];
    const target = [...rows].find((row) => row.dataset.messageId === messageId);
    if (!target) {
      setFlashId(null);
      setNotice(NOT_LOADED_NOTICE);
      timer.current = setTimeout(() => setNotice(null), NOTICE_MS);
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setNotice(null);
    setFlashId(messageId);
    timer.current = setTimeout(() => setFlashId(null), FLASH_MS);
  }

  return { flashId, notice, jumpTo };
}
