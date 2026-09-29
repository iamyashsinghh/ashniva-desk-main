import type { ReactElement } from 'react';
import { FlatList } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import type { PagedResult } from '../../../shared/api/queries';
import { ListFooterLoader } from '../../../shared/components/feedback';
import type { IconName } from '../../../shared/components/Icon';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { Screen } from '../../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * A cursor-paged list with its header always on screen.
 *
 * Loading, failure and "nothing here" are drawn where the rows would be rather than in place of
 * the whole list, so the search box above keeps its focus while a new search loads.
 */
export function PagedList<T extends { id: string }>({
  result,
  header,
  renderRow,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  loadingLabel,
}: {
  result: PagedResult<T>;
  header: ReactElement;
  renderRow: (item: T) => ReactElement;
  emptyTitle: string;
  emptyDescription?: string;
  emptyIcon: IconName;
  loadingLabel: string;
}) {
  const theme = useTheme();

  let empty = (
    <EmptyState
      title={emptyTitle}
      icon={emptyIcon}
      {...(emptyDescription ? { description: emptyDescription } : {})}
    />
  );
  if (result.isLoading) {
    empty = <LoadingState label={loadingLabel} />;
  } else if (result.error) {
    empty = (
      <ErrorState
        message={errorMessage(result.error)}
        offline={result.error instanceof Error && result.error.name === 'NetworkError'}
        onRetry={result.refresh}
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={result.items}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={result.isRefreshing} onRefresh={result.refresh} />}
        onEndReached={result.loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.sm }}
        ListEmptyComponent={empty}
        ListFooterComponent={result.isLoadingMore ? <ListFooterLoader /> : null}
        renderItem={({ item }) => renderRow(item)}
      />
    </Screen>
  );
}
