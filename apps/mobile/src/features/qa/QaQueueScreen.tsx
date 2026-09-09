import { TESTER_VIEW, type TesterQueue, type TesterView } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Card, Pill, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { PHONE_TESTER_VIEWS, assignmentStatusLabel, assignmentStatusTone } from './qa-display';

/**
 * The tester's queue.
 *
 * One request answers both halves: `GET /qa/assignments` returns the counts behind every view and
 * the selected view's list, so switching views does not mean two round trips to find out that the
 * next one is empty.
 *
 * Assigning testing to somebody is not here. That is a decision about who does what, taken with a
 * team's workload in front of you; what a phone is for is working through what you have been given.
 */
export function QaQueueScreen({ onOpen }: { onOpen: (assignmentId: string) => void }) {
  const theme = useTheme();
  const [view, setView] = useState<TesterView>(TESTER_VIEW.MINE);
  const query = useResource<TesterQueue>(['qa', 'assignments', view], '/qa/assignments', {
    query: { view, limit: 50 },
  });

  const queue = query.data?.queue ?? [];
  const counts = query.data?.counts ?? null;

  const header = (
    <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, paddingBottom: 0 }}>
      <Segmented
        options={PHONE_TESTER_VIEWS}
        value={view}
        onChange={setView}
        label="Which testing to show"
      />
      {counts ? (
        <AppText size="xs" tone="faint">
          {counts[TESTER_VIEW.MINE]} yours · {counts[TESTER_VIEW.READY]} ready ·{' '}
          {counts[TESTER_VIEW.OVERDUE]} overdue
        </AppText>
      ) : null}
    </View>
  );

  if (query.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading your queue" />
      </Screen>
    );
  }

  if (query.error && queue.length === 0) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={queue}
        keyExtractor={(assignment) => assignment.id}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState title="Nothing to test" description="This view is empty right now." />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.subjectLabel}
            accessibilityHint="Opens the assignment"
            onPress={() => onOpen(item.id)}
            style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
          >
            <Card>
              <AppText size="xs" tone="faint">
                {item.projectName} · {item.kind} · {item.environment.toLowerCase()}
              </AppText>
              <AppText weight="medium" numberOfLines={2}>
                {item.subjectLabel}
              </AppText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Pill
                  label={assignmentStatusLabel(item.status)}
                  tone={assignmentStatusTone(item.status)}
                />
                {item.isOverdue ? <Pill label="Overdue" tone="danger" /> : null}
              </View>
              {item.dueAt ? (
                <AppText size="xs" tone="muted">
                  Due {formatDateTime(item.dueAt)}
                </AppText>
              ) : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
