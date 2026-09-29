import {
  SEARCH_DEFAULT_GROUP_LIMIT,
  SEARCH_MIN_QUERY_LENGTH,
  type SearchResponse,
} from '@ashniva/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';

export const searchKeys = {
  results: (term: string, limit: number) => ['search', 'results', term, limit] as const,
};

/** Whether a term is long enough for the API to accept it. */
export function isSearchable(term: string): boolean {
  return term.trim().length >= SEARCH_MIN_QUERY_LENGTH;
}

/**
 * One search, the same request the web's box sends.
 *
 * Disabled below the API's minimum term length, so the field does not spend a request — and a
 * slot in the endpoint's own per-minute allowance — on a term the API would reject anyway.
 *
 * The previous answer stays on screen while the next one loads: on a phone the list jumping to a
 * skeleton on every pause in typing reads as flicker, not as progress.
 */
export function useSearch(term: string, limit: number = SEARCH_DEFAULT_GROUP_LIMIT) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: searchKeys.results(trimmed, limit),
    enabled: isSearchable(trimmed),
    // Backspacing a letter and retyping it is the commonest thing that happens in a search box.
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    retry: shouldRetry,
    queryFn: () => apiRequest<SearchResponse>('/search', { query: { q: trimmed, limit } }),
  });
}
