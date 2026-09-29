import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList } from 'react-native';

import type { ThreadRow } from './thread-rows';

/** How many older pages a tap on a quote may fetch looking for its original. */
export const JUMP_PAGE_BUDGET = 3;
const FLASH_MS = 1400;
const NOTICE_MS = 2600;
/** Long enough for rows just loaded or just scrolled to to have been laid out. */
const SETTLE_MS = 60;

export const FURTHER_BACK = 'Original message is further back';

interface Pending {
  messageId: string;
  pagesLeft: number;
}

/**
 * Going from a reply's quote to the line it answers.
 *
 * When the original is loaded the list scrolls to it and it flashes. When it is not, a few older
 * pages are fetched looking for it — a quote of something from last week should not be a dead end —
 * and past that budget, or at the very start of the thread, a short notice says why nothing moved.
 * Nothing here can throw: a scroll to a row the list has not measured yet is retried from an
 * estimate rather than left to FlatList's own error.
 */
export function useJumpToMessage({
  list,
  rows,
  hasEarlier,
  isLoadingEarlier,
  onLoadEarlier,
}: {
  list: RefObject<FlatList<ThreadRow> | null>;
  rows: readonly ThreadRow[];
  hasEarlier: boolean;
  isLoadingEarlier: boolean;
  onLoadEarlier: () => void;
}) {
  const [flashId, setFlashId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);
  // One retry per jump: an estimate that misses twice is left where it landed, not looped on.
  const retried = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const later = useCallback((run: () => void, ms: number) => {
    timers.current.push(setTimeout(run, ms));
  }, []);
  useEffect(() => {
    const scheduled = timers.current;
    return () => scheduled.forEach(clearTimeout);
  }, []);

  const indexOf = useCallback(
    (messageId: string) =>
      rows.findIndex((row) => row.kind === 'message' && row.message.id === messageId),
    [rows],
  );

  const reveal = useCallback(
    (messageId: string, index: number) => {
      later(() => {
        retried.current = false;
        list.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
        setFlashId(messageId);
        later(() => setFlashId((current) => (current === messageId ? null : current)), FLASH_MS);
      }, SETTLE_MS);
    },
    [later, list],
  );

  const tell = useCallback(
    (text: string) => {
      later(() => {
        setNotice(text);
        later(() => setNotice((current) => (current === text ? null : current)), NOTICE_MS);
      }, 0);
    },
    [later],
  );

  const search = useCallback(
    (want: Pending) => {
      const index = indexOf(want.messageId);
      if (index !== -1) {
        pending.current = null;
        reveal(want.messageId, index);
      } else if (hasEarlier && want.pagesLeft > 0) {
        pending.current = { ...want, pagesLeft: want.pagesLeft - 1 };
        onLoadEarlier();
      } else {
        pending.current = null;
        tell(FURTHER_BACK);
      }
    },
    [hasEarlier, indexOf, onLoadEarlier, reveal, tell],
  );

  // Each page that lands is searched once, when the fetch for it has settled.
  useEffect(() => {
    if (pending.current && !isLoadingEarlier) {
      search(pending.current);
    }
  }, [rows, isLoadingEarlier, search]);

  const jumpTo = useCallback(
    (messageId: string) => search({ messageId, pagesLeft: JUMP_PAGE_BUDGET }),
    [search],
  );

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      list.current?.scrollToOffset({
        offset: info.averageItemLength * info.index,
        animated: false,
      });
      if (retried.current) {
        return;
      }
      retried.current = true;
      later(() => {
        if (info.index < rows.length) {
          list.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
        }
      }, 120);
    },
    [later, list, rows.length],
  );

  return { jumpTo, flashId, notice, onScrollToIndexFailed };
}
