import type { MessageSummary } from '@ashniva/types';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

import { spokenBody } from './message-labels';

/**
 * Says a line somebody else just wrote, once, to a screen reader.
 *
 * Not on the first render — the thread being opened is not news — and never the reader's own line
 * read back to them. The newest id is compared rather than the length, so loading older history
 * at the top announces nothing.
 */
export function useAnnounceArrivals(
  messages: readonly MessageSummary[],
  viewerId: string | null,
  names: ReadonlyMap<string, string>,
): void {
  const newest = messages.at(-1);
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previous = seen.current;
    seen.current = newest?.id ?? null;
    if (previous === undefined || !newest || newest.id === previous) {
      return;
    }
    if (newest.sender && newest.sender.id !== viewerId && !newest.deletedAt) {
      AccessibilityInfo.announceForAccessibility(
        `${newest.sender.name}: ${spokenBody(newest.body, names)}`,
      );
    }
  }, [newest, viewerId, names]);
}
