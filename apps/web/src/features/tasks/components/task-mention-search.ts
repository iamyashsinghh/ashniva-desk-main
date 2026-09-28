import {
  MAX_MENTIONABLE_QUERY_LENGTH,
  MIN_MENTIONABLE_QUERY_LENGTH,
  type MentionableUser,
} from '@ashniva/types';
import { useEffect, useState } from 'react';

import { useTaskMentionableQuery } from '../api';

const DEBOUNCE_MS = 200;

function asServerTerm(term: string): string {
  const trimmed = term.trim();
  if (trimmed.length < MIN_MENTIONABLE_QUERY_LENGTH) {
    return '';
  }
  return trimmed.slice(0, MAX_MENTIONABLE_QUERY_LENGTH);
}

/** Mention picker search for task comments — same shape as the chat picker. */
export function useTaskMentionSearch(taskId: string | undefined) {
  const [term, setTerm] = useState<string | null>(null);
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState({ list: '', index: 0 });

  useEffect(() => {
    if (term === null) {
      return undefined;
    }
    const timer = setTimeout(() => setDebounced(asServerTerm(term)), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term]);

  const result = useTaskMentionableQuery(taskId, debounced, term !== null);
  const people = result.data?.items ?? [];
  const list = `${term === null ? 'closed' : 'open'}|${debounced}`;
  const activeIndex =
    active.list === list ? Math.min(active.index, Math.max(0, people.length - 1)) : 0;

  return {
    term,
    isOpen: term !== null,
    people,
    isLoading: result.isFetching || result.data === undefined,
    hasMore: Boolean(result.data?.nextCursor),
    activeIndex,
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
