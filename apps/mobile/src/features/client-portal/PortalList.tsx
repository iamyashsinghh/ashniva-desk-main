import type { ReactElement, ReactNode } from 'react';
import { FlatList } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { ListFooterLoader } from '../../shared/components/feedback';
import type { IconName } from '../../shared/components/Icon';
import { Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The list half of every portal list screen: a header of search and filters, then cards.
 *
 * The header stays on screen through loading, failure and an empty result, so a search that
 * matched nothing can be cleared from where it was typed. The empty slot is where the three states
 * go — a list that failed to load is not a list with nothing in it.
 */
export function PortalList<T extends { id: string }>({
  items,
  isLoading,
  error,
  isRefreshing,
  onRefresh,
  header,
  renderItem,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  filtered = false,
  onEndReached,
  isLoadingMore = false,
}: {
  items: readonly T[];
  isLoading: boolean;
  error: unknown;
  isRefreshing: boolean;
  onRefresh: () => void;
  header?: ReactNode;
  renderItem: (item: T) => ReactElement;
  loadingLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: IconName;
  /** A search or filter is on, so "nothing" means "nothing matches" rather than "nothing yet". */
  filtered?: boolean;
  onEndReached?: () => void;
  isLoadingMore?: boolean;
}) {
  const theme = useTheme();

  let empty: ReactElement = (
    <EmptyState title={emptyTitle} description={emptyDescription} icon={emptyIcon} />
  );
  if (isLoading) {
    empty = <LoadingState label={loadingLabel} />;
  } else if (error) {
    empty = (
      <ErrorState
        message={errorMessage(error)}
        offline={error instanceof Error && error.name === 'NetworkError'}
        onRetry={onRefresh}
      />
    );
  } else if (filtered) {
    empty = (
      <EmptyState
        title="Nothing matches"
        description="Try another search or clear the filters."
        icon="search"
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={isLoading || error ? [] : items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={isRefreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        ListHeaderComponent={header ? <>{header}</> : undefined}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={empty}
        ListFooterComponent={isLoadingMore ? <ListFooterLoader /> : undefined}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => renderItem(item)}
      />
    </Screen>
  );
}
