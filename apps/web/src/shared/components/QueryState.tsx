import { Button, EmptyState, Spinner } from '@ashniva/ui';
import type { ReactNode } from 'react';

import { ApiError, errorMessage } from '../lib/api-client';

interface QueryStateProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry?: () => void;
  children: ReactNode;
  /** Shown while loading; a spinner by default. */
  loadingLabel?: string;
  /**
   * Replaces the spinner while loading.
   *
   * A spinner in an empty box tells you something is happening and nothing about what. Where a
   * screen knows the shape of what is coming — a table, a row of tiles — it can show that shape
   * instead, which keeps the page from moving twice as content lands. Optional, so the 70-odd
   * screens that have not been converted keep exactly the state they have today.
   */
  loadingFallback?: ReactNode;
}

/** Loading / error / permission-denied states that every screen shows the same way. */
export function QueryState({
  isLoading,
  isError,
  error,
  onRetry,
  children,
  loadingLabel = 'Loading',
  loadingFallback,
}: QueryStateProps) {
  if (isLoading) {
    return (
      loadingFallback ?? (
        <div className="query-state">
          <Spinner label={loadingLabel} />
        </div>
      )
    );
  }
  if (isError) {
    const status = error instanceof ApiError ? error.status : undefined;
    if (status === 403) {
      return <EmptyState title="You don’t have access to this" description={errorMessage(error)} />;
    }
    if (status === 404) {
      return (
        <EmptyState title="Not found" description="This item does not exist or is not yours." />
      );
    }
    return (
      <EmptyState
        title="Something went wrong"
        description={errorMessage(error)}
        action={onRetry ? <Button onClick={onRetry}>Try again</Button> : undefined}
      />
    );
  }
  return children;
}
