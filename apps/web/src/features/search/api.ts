import {
  SEARCH_DEFAULT_GROUP_LIMIT,
  SEARCH_MIN_QUERY_LENGTH,
  type SearchResponse,
} from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const searchKeys = {
  all: ['search'] as const,
  results: (term: string, limit: number) => ['search', 'results', term, limit] as const,
};

/**
 * One search. Disabled below the API's minimum term length, so the box does not spend a request
 * (and a slot in the endpoint's per-minute allowance) on a query the API would reject anyway.
 */
export function useSearchQuery(term: string, limit = SEARCH_DEFAULT_GROUP_LIMIT) {
  const trimmed = term.trim();
  const enabled = trimmed.length >= SEARCH_MIN_QUERY_LENGTH;
  return useQuery({
    queryKey: searchKeys.results(trimmed, limit),
    enabled,
    // A term the user has already typed once is worth keeping for a moment: backspacing a letter
    // and retyping it is the commonest thing that happens in a search box.
    staleTime: 30_000,
    queryFn: () => apiRequest<SearchResponse>('/search', { query: { q: trimmed, limit } }),
  });
}
