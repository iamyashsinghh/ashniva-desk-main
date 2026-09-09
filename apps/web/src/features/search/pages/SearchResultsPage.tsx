import { SEARCH_MAX_GROUP_LIMIT, SEARCH_MIN_QUERY_LENGTH } from '@ashniva/types';
import { EmptyState, Input, PageHeader } from '@ashniva/ui';
import { Link, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { useSearchQuery } from '../api';

import '../search.css';

/**
 * The full result set: every group the API returned, up to the per-module cap.
 *
 * The term lives in the URL, so a search is a link somebody can send — which is also why the page
 * shows nothing at all until there is a term worth running: an empty `?q=` must not read as "here
 * is everything".
 *
 * The box is uncontrolled and keyed on the term, so arriving from the topbar with a new `?q=`
 * remounts it with the new value instead of needing an effect to copy the URL into state.
 */
export function SearchResultsPage() {
  const [params, setParams] = useSearchParams();
  const term = params.get('q') ?? '';
  const query = useSearchQuery(term, SEARCH_MAX_GROUP_LIMIT);
  const groups = query.data?.groups ?? [];
  const tooShort = term.trim().length < SEARCH_MIN_QUERY_LENGTH;

  return (
    <>
      <PageHeader
        title="Search"
        subtitle={
          term
            ? `Results for “${term}” across everything you can see.`
            : 'Search across everything you can see.'
        }
      />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get('q') ?? '').trim();
          setParams(value ? { q: value } : {});
        }}
      >
        <Input key={term} name="q" type="search" aria-label="Search" defaultValue={term} />
      </form>

      {tooShort ? (
        <EmptyState
          title="Type at least three characters"
          description="Shorter than that matches almost everything, and costs a full scan of every table to prove it."
        />
      ) : (
        <QueryState
          isLoading={query.isPending}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          loadingLabel="Searching"
        >
          {groups.length === 0 ? (
            <EmptyState title="No matches" description={`Nothing you can see matches “${term}”.`} />
          ) : (
            groups.map((group) => (
              <section key={group.type} className="search-results__group">
                <h2 className="search-results__group-heading">
                  {group.label}
                  <span className="search-results__count">
                    {group.hits.length}
                    {group.hasMore ? '+' : ''}
                  </span>
                </h2>
                <div className="search-results__list">
                  {group.hits.map((hit) => (
                    <Link
                      key={`${hit.type}-${hit.id}`}
                      to={hit.href}
                      className="search-results__item"
                    >
                      {hit.reference ? (
                        <span className="global-search__reference">{hit.reference}</span>
                      ) : null}
                      <span className="global-search__title">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="global-search__subtitle">{hit.subtitle}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}
        </QueryState>
      )}
    </>
  );
}
