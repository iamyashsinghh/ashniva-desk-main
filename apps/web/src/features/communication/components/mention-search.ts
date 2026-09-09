import {
  MAX_MENTIONABLE_QUERY_LENGTH,
  MIN_MENTIONABLE_QUERY_LENGTH,
  type MentionableUser,
} from '@ashniva/types';
import { useEffect, useState } from 'react';

import { useMentionableQuery } from '../api';

/** Long enough that a typist does not fire a request per keystroke, short enough to feel live. */
const DEBOUNCE_MS = 200;

/**
 * The term as the endpoint defines one, or the empty string for "everybody, in name order".
 *
 * Below `MIN_MENTIONABLE_QUERY_LENGTH` the server ignores the term and returns the audience
 * unfiltered, so sending the first letter would fetch that same broad page under a second cache
 * key — the identical list, twice, for nothing. Collapsing it here means `@`, `@r` and `@ro` cost
 * one request between them rather than three. The upper bound is the DTO's: past
 * `MAX_MENTIONABLE_QUERY_LENGTH` the request is a 400, and nobody's name is eighty characters, so
 * the tail is dropped rather than turned into an error somebody has to read.
 */
function asServerTerm(term: string): string {
  const trimmed = term.trim();
  if (trimmed.length < MIN_MENTIONABLE_QUERY_LENGTH) {
    return '';
  }
  return trimmed.slice(0, MAX_MENTIONABLE_QUERY_LENGTH);
}

/**
 * The mention picker's state: what has been typed after the `@`, and who the server says matches.
 *
 * Debounced, because the picker opens on a keystroke and the endpoint is a search. What is *not*
 * debounced is the closing: `@` and Escape take effect at once, so the list never lingers over a
 * word somebody has finished typing.
 *
 * The active option is held here rather than in the picker so the arrow keys can live on the
 * composer's textarea, where the caret is. Moving focus into a list to choose a name would
 * interrupt the sentence somebody is in the middle of writing.
 */
export function useMentionSearch(conversationId: string | undefined) {
  const [term, setTerm] = useState<string | null>(null);
  const [debounced, setDebounced] = useState('');
  /**
   * Which option the arrows have moved to, and which list that answer belongs to.
   *
   * Held together rather than as a bare index so the highlight resets by *derivation* when the
   * list changes — a narrower term is a different list, and an index kept across it would leave
   * the highlight on whichever row happened to land in that position.
   */
  const [active, setActive] = useState({ list: '', index: 0 });

  useEffect(() => {
    if (term === null) {
      return undefined;
    }
    const timer = setTimeout(() => setDebounced(asServerTerm(term)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const result = useMentionableQuery(conversationId, debounced, term !== null);
  const people = result.data?.items ?? [];
  const list = `${term === null ? 'closed' : 'open'}|${debounced}`;
  const activeIndex =
    active.list === list ? Math.min(active.index, Math.max(0, people.length - 1)) : 0;

  return {
    term,
    isOpen: term !== null,
    people,
    // "No data yet" reads as loading, not as "nobody matches": the picker opens on a keystroke
    // and the first answer has not arrived, so saying nobody matches would be a lie for a frame.
    isLoading: result.isFetching || result.data === undefined,
    hasMore: Boolean(result.data?.nextCursor),
    activeIndex,
    /** Opens or narrows the picker. Null closes it. */
    setTerm,
    move(delta: number) {
      if (people.length > 0) {
        setActive({ list, index: (activeIndex + delta + people.length) % people.length });
      }
    },
    chosen(): MentionableUser | undefined {
      return people[activeIndex];
    },
  };
}
