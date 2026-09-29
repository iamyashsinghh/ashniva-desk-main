import { SEARCH_DEFAULT_GROUP_LIMIT, SEARCH_MAX_GROUP_LIMIT, type SearchHit } from '@ashniva/types';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { useDebounced } from '../../shared/components/FilterSheet';
import { Screen } from '../../shared/components/primitives';
import { QueryState } from '../../shared/components/states';
import { useSession } from '../auth/SessionProvider';
import { isClientUser } from '../auth/audience';
import { clearRecentSearches, rememberSearch, useRecentSearches } from './recent-searches';
import { isSearchable, useSearch } from './search-api';
import { targetForHit, type SearchTarget } from './search-targets';
import { SearchBar } from './SearchBar';
import { SearchIdle } from './SearchIdle';
import { SearchResults } from './SearchResults';

/** Long enough that a typist does not fire a request per keystroke, short enough to feel live. */
const DEBOUNCE_MS = 300;

/**
 * Searching everything the caller may read — the web's topbar box and its results page, as one
 * phone screen.
 *
 * Typing runs the quick search (a handful per module), as the web's box does; the keyboard's
 * search key or "Show more" runs the full one, as the web's results page does. Which modules are
 * searched is not decided here: the API answers per module from the caller's own permissions, so
 * there is nothing on this side to keep in step with it.
 */
export function SearchScreen({
  initialQuery = '',
  onBack,
  onOpen,
}: {
  initialQuery?: string;
  onBack: () => void;
  onOpen: (target: SearchTarget) => void;
}) {
  const { user } = useSession();
  const client = isClientUser(user);
  const recent = useRecentSearches(user?.id ?? null);
  const [term, setTerm] = useState(initialQuery);
  const [expandedFor, setExpandedFor] = useState<string | null>(null);

  const current = term.trim();
  const debounced = useDebounced(current, DEBOUNCE_MS);
  // Asking for the full set is a deliberate act, so it runs at once rather than after the pause.
  const active = expandedFor === current ? current : debounced;
  const expanded = expandedFor !== null && expandedFor === active;
  const query = useSearch(active, expanded ? SEARCH_MAX_GROUP_LIMIT : SEARCH_DEFAULT_GROUP_LIMIT);
  const groups = query.data?.groups ?? [];
  // Mid-pause the settled term can still be too short, and the answer on hand can be an empty one
  // kept from an earlier term; neither says anything about what is in the box now.
  const waiting =
    !isSearchable(active) || query.isPending || (query.isPlaceholderData && groups.length === 0);

  const remember = (value: string) => {
    if (user && isSearchable(value)) {
      rememberSearch(user.id, value);
    }
  };

  const showAll = () => {
    if (isSearchable(current)) {
      setExpandedFor(current);
      remember(current);
    }
  };

  const targetOf = (hit: SearchHit) => {
    const target = targetForHit(hit, client);
    if (!target) {
      return null;
    }
    return () => {
      Keyboard.dismiss();
      remember(active);
      onOpen(target);
    };
  };

  return (
    <Screen>
      <SearchBar
        value={term}
        onChange={setTerm}
        onSubmit={showAll}
        onBack={onBack}
        busy={isSearchable(current) && query.isFetching && query.data !== undefined}
      />
      {!isSearchable(current) ? (
        <SearchIdle
          term={term}
          client={client}
          recent={recent}
          onPickRecent={(value) => {
            setTerm(value);
            setExpandedFor(value);
          }}
          onClearRecent={() => user && clearRecentSearches(user.id)}
        />
      ) : (
        <QueryState
          isLoading={waiting}
          loadingLabel="Searching"
          error={query.data ? null : query.error}
          onRetry={() => void query.refetch()}
          isEmpty={groups.length === 0}
          emptyIcon="search-outline"
          emptyTitle="No matches"
          emptyDescription={`Nothing you can see matches “${active}”. Try a reference such as a ticket number, or fewer words.`}
        >
          <SearchResults
            groups={groups}
            truncated={query.data?.truncated ?? false}
            expanded={expanded}
            onShowMore={showAll}
            targetOf={targetOf}
          />
        </QueryState>
      )}
    </Screen>
  );
}
