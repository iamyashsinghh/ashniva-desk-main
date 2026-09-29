import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { PagedResult } from '../../../shared/api/queries';
import { ListFooterLoader } from '../../../shared/components/feedback';
import type { IconName } from '../../../shared/components/Icon';
import { Button } from '../../../shared/components/primitives';
import { QueryState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * A paged list inside the project's scrolling page.
 *
 * Rows are mapped rather than virtualised: a `FlatList` nested in the page's `ScrollView` cannot
 * scroll on its own and warns for it, and a project tab is a page or two, not thousands. The next
 * page is asked for with a button rather than on reaching the end, because the end of this list is
 * not the end of a scroll view it owns.
 */
export function PagedRows<T>({
  result,
  keyOf,
  renderRow,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  loadingLabel,
}: {
  result: PagedResult<T>;
  keyOf: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyIcon?: IconName;
  loadingLabel: string;
}) {
  const theme = useTheme();
  return (
    <QueryState
      isLoading={result.isLoading}
      error={result.error}
      isEmpty={result.items.length === 0}
      emptyTitle={emptyTitle}
      {...(emptyDescription ? { emptyDescription } : {})}
      {...(emptyIcon ? { emptyIcon } : {})}
      onRetry={result.refresh}
      loadingLabel={loadingLabel}
    >
      <View style={{ gap: theme.spacing.sm }}>
        {result.items.map((item) => (
          <View key={keyOf(item)}>{renderRow(item)}</View>
        ))}
        {result.isLoadingMore ? <ListFooterLoader /> : null}
        {result.hasMore && !result.isLoadingMore ? (
          <Button
            label="Show more"
            variant="secondary"
            icon="chevron-down"
            onPress={result.loadMore}
          />
        ) : null}
      </View>
    </QueryState>
  );
}
