import { TASK_LIST_VIEW, TASK_STATUS_LABELS, type TaskSummary } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { usePagedResource } from '../../shared/api/queries';
import { Segmented, type SegmentOption } from '../../shared/components/navigation-list';
import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { taskTone } from './task-display';
import { TaskTimingPill } from './TaskTimingPill';

/**
 * The tasks assigned to you, in two views.
 *
 * **Now** is what can be worked on; **Upcoming** is what is assigned but scheduled to begin
 * later. Separating them is the whole point of a scheduled start: a queue that mixes the two
 * reads as a longer list of work you are behind on, when half of it has not started yet.
 *
 * Both views are asked for by name rather than filtered on the device. The API already knows who
 * is calling and when a scheduled start has passed, and a client-side filter would mean
 * downloading other people's work in order to hide it.
 */
type TaskView = typeof TASK_LIST_VIEW.MY | typeof TASK_LIST_VIEW.UPCOMING;

const VIEWS: readonly SegmentOption<TaskView>[] = [
  { value: TASK_LIST_VIEW.MY, label: 'Now' },
  { value: TASK_LIST_VIEW.UPCOMING, label: 'Upcoming' },
];

const EMPTY: Record<TaskView, { title: string; description: string }> = {
  [TASK_LIST_VIEW.MY]: {
    title: 'Nothing assigned',
    description: 'Tasks you can work on now will appear here.',
  },
  [TASK_LIST_VIEW.UPCOMING]: {
    title: 'Nothing scheduled',
    description: 'Tasks assigned to you with a start date in the future will appear here.',
  },
};

export function TasksScreen({ onOpen }: { onOpen: (taskId: string) => void }) {
  const theme = useTheme();
  const [view, setView] = useState<TaskView>(TASK_LIST_VIEW.MY);
  const list = usePagedResource<TaskSummary>(['tasks', view], '/tasks', { view, limit: 20 });

  const header = (
    <View style={{ padding: theme.spacing.lg, paddingBottom: 0 }}>
      <Segmented options={VIEWS} value={view} onChange={setView} label="Which tasks to show" />
    </View>
  );

  if (list.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading your tasks" />
      </Screen>
    );
  }

  if (list.error && list.items.length === 0) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={list.error instanceof Error ? list.error.message : 'Could not load your tasks'}
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
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={list.isRefreshing}
            onRefresh={list.refresh}
            tintColor={theme.colors.primary}
          />
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={<EmptyState {...EMPTY[view]} />}
        ListFooterComponent={list.isLoadingMore ? <LoadingState label="Loading more" /> : undefined}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.key} ${item.title}`}
            accessibilityHint="Opens the task"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText size="xs" tone="faint">
                {item.key}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.title}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Pill label={TASK_STATUS_LABELS[item.status]} tone={taskTone(item.status)} />
                {/*
                  On time or late, from the server's own verdict. `isOverdue` below is a different
                  question — it compares the calendar due *date* and is what the list views filter
                  on — so both are shown rather than one standing in for the other.
                */}
                <TaskTimingPill timing={item.timing} />
                {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
              </View>
              {item.isUpcoming && item.scheduledStartAt ? (
                <AppText size="xs" tone="muted">
                  Starts {formatDateTime(item.scheduledStartAt)}
                </AppText>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
