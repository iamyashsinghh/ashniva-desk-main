import type { MessageSummary } from '@ashniva/types';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/** How far up counts as "reading history". Past a screenful's nudge, not a finger's twitch. */
export const AWAY_FROM_LATEST_PX = 240;

/**
 * Keeping an inverted thread where the reader wants it.
 *
 * Index 0 of an inverted list is the *start* of its content, so a message arriving there pushes
 * everything else along by its height — under the thumb of somebody reading history, whose line
 * jumped away as they read it. `maintainVisibleContentPosition` holds the first visible row still
 * instead, and within `AWAY_FROM_LATEST_PX` of the bottom it follows the newest line, which is
 * the web's rule: follow only a reader who is already at the latest.
 *
 * One exception, also the web's: the reader's own message always brings them down to it, because
 * they have just sent it and want to see it land.
 */
export const MAINTAIN_POSITION = {
  minIndexForVisible: 0,
  autoscrollToTopThreshold: AWAY_FROM_LATEST_PX,
} as const;

export function useThreadScroll<T>(
  list: RefObject<FlatList<T> | null>,
  messages: readonly MessageSummary[],
  viewerId: string | null,
) {
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  const newest = messages.at(-1);
  const newestId = newest?.id ?? null;
  const newestIsOwn = viewerId !== null && newest?.sender?.id === viewerId;
  const followed = useRef(newestId);

  // Only a *new* newest line counts: the thread refetching the same one must not move anybody.
  useEffect(() => {
    if (newestId === followed.current) {
      return;
    }
    followed.current = newestId;
    if (newestIsOwn) {
      list.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [list, newestId, newestIsOwn]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Inverted: an offset of zero is the newest message.
    setAwayFromLatest(event.nativeEvent.contentOffset.y > AWAY_FROM_LATEST_PX);
  }, []);

  const jumpToLatest = useCallback(() => {
    list.current?.scrollToOffset({ offset: 0, animated: true });
    setAwayFromLatest(false);
  }, [list]);

  return { awayFromLatest, onScroll, jumpToLatest };
}
