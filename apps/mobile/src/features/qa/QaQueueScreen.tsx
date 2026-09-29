import { TESTER_VIEW, type TesterQueue, type TesterView } from '@ashniva/types';
import { useState } from 'react';
import { FlatList } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { useResource } from '../../shared/api/queries';
import { Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { TabBar } from '../../shared/components/TabBar';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { testerViewLabel, testerViewTabs } from './qa-labels';
import { QaQueueRow } from './QaQueueRow';

/**
 * The tester's queue — all nine views the web workspace has.
 *
 * Nine, because a tester's day is nine different questions and answering them by filtering one
 * list is how things get missed. One request answers both halves: `GET /qa/assignments` returns
 * the counts behind every view with the selected view's list, so the badges cannot disagree with
 * the rows beneath them.
 */
export function QaQueueScreen({ onOpen }: { onOpen: (assignmentId: string) => void }) {
  const theme = useTheme();
  const [view, setView] = useState<TesterView>(TESTER_VIEW.MINE);
  const query = useResource<TesterQueue>(['qa', 'queue', view], '/qa/assignments', {
    query: { view, limit: 50 },
  });

  const queue = query.data?.queue ?? [];
  // The previous view's counts stay up while the next one loads, so the tabs do not flicker.
  const [counts, setCounts] = useState(query.data?.counts ?? null);
  if (query.data && query.data.counts !== counts) {
    setCounts(query.data.counts);
  }

  const header = (
    <TabBar
      options={testerViewTabs(counts)}
      value={view}
      onChange={setView}
      accessibilityLabel="Which testing to show"
    />
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
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.screen }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing here"
            description={`No assignments in "${testerViewLabel(view)}" right now.`}
            icon="flask-outline"
            iconTone="violet"
          />
        }
        renderItem={({ item }) => <QaQueueRow item={item} onOpen={() => onOpen(item.id)} />}
      />
    </Screen>
  );
}
