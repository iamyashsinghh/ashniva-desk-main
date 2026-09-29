import type { TaskSummary } from '@ashniva/types';
import type { ReactNode } from 'react';
import { FlatList } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { usePagedResource } from '../../shared/api/queries';
import { ListFooterLoader } from '../../shared/components/feedback';
import type { IconName } from '../../shared/components/Icon';
import { Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { TaskRow } from './TaskRow';
import { PullRefresh } from '../../shared/components/PullRefresh';

export interface TaskEmptyCopy {
  title: string;
  description: string;
  icon: IconName;
}

/**
 * A paged `/tasks` list under a header, with its loading, error and empty states.
 *
 * The header sits above the list rather than inside it: it holds the search box, and a header
 * re-rendered by the list on every keystroke is one that drops the keyboard mid-word.
 */
export function TaskResults({
  query,
  header,
  empty,
  onOpen,
  showAssignee = false,
}: {
  query: Readonly<Record<string, string>>;
  header: ReactNode;
  empty: TaskEmptyCopy;
  onOpen: (taskId: string) => void;
  showAssignee?: boolean;
}) {
  const theme = useTheme();
  // Under `['tasks', …]` so a realtime `task.updated` refreshes every open list.
  const list = usePagedResource<TaskSummary>(['tasks', 'list', query], '/tasks', {
    ...query,
    limit: 20,
  });

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading tasks" />
      </Screen>
    );
  }

  if (list.error && list.items.length === 0) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={errorMessage(list.error)}
          offline={list.error instanceof Error && list.error.name === 'NetworkError'}
          onRetry={list.refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={list.items}
        keyExtractor={(task) => task.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: theme.spacing.sm,
          padding: theme.spacing.screen,
          paddingTop: theme.spacing.sm,
        }}
        refreshControl={
          <PullRefresh
            busy={list.isRefreshing}
            onRefresh={list.refresh}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={<EmptyState {...empty} iconTone="success" />}
        ListFooterComponent={list.isLoadingMore ? <ListFooterLoader /> : undefined}
        renderItem={({ item }) => (
          <TaskRow task={item} onOpen={onOpen} showAssignee={showAssignee} />
        )}
      />
    </Screen>
  );
}
