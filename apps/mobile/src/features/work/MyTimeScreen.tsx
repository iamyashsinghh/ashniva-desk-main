import type { WorkLogSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Card, Divider, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { formatDate, formatMinutes } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import {
  TIME_RANGES,
  groupByDay,
  rangeDates,
  totalMinutes,
  type TimeRange,
} from './work-log-display';

/**
 * The time you have logged.
 *
 * Logging time is already possible from a task; reading it back was not, and "did I write up
 * Tuesday" is a question people ask on a train rather than at a desk. So this is the other half of
 * the loop: what is on record for you, by day, with the totals.
 *
 * It is **your** time and only yours. The request is pinned to the signed-in user's id and there
 * is no control to widen it — see `work-log-display.ts` for why.
 */
export function MyTimeScreen({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const theme = useTheme();
  const { user } = useSession();
  const [range, setRange] = useState<TimeRange>('week');
  const dates = useMemo(() => rangeDates(range), [range]);

  const query = useResource<WorkLogSummary[]>(
    ['work-logs', user?.id ?? 'nobody', range],
    '/work-logs',
    {
      enabled: Boolean(user),
      query: { userId: user?.id, from: dates.from, to: dates.to },
    },
  );

  // Memoised rather than defaulted inline: `data ?? []` is a new array on every render, which
  // would make the grouping below re-run each time and defeat its own memo.
  const { data } = query;
  const entries = useMemo(() => data ?? [], [data]);
  const days = useMemo(() => groupByDay(entries), [entries]);
  const refresh = () => void query.refetch();

  const header = (
    <View style={{ gap: theme.spacing.sm, padding: theme.spacing.lg, paddingBottom: 0 }}>
      <Segmented options={TIME_RANGES} value={range} onChange={setRange} label="Which days" />
      <AppText size="sm" tone="muted">
        {formatMinutes(totalMinutes(entries))} logged
        {range === 'week' ? ' over the last seven days' : ' today'}
      </AppText>
    </View>
  );

  if (query.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading your time" />
      </Screen>
    );
  }

  if (query.error && entries.length === 0) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {header}
      <FlatList
        data={days}
        keyExtractor={(day) => day.date}
        contentContainerStyle={{ gap: theme.spacing.sm, padding: theme.spacing.lg }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Nothing logged"
            description={
              range === 'today'
                ? 'Time you log against a task today appears here.'
                : 'Time you log against a task appears here, by the day you did it.'
            }
          />
        }
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppText weight="medium">{formatDate(item.date) ?? item.date}</AppText>
              </View>
              <AppText tone="muted">{formatMinutes(item.minutes)}</AppText>
            </View>
            {item.entries.map((entry) => (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`${entry.task.key} ${formatMinutes(entry.minutes)}`}
                accessibilityHint="Opens the task"
                onPress={() => onOpenTask(entry.task.id)}
                style={({ pressed }) => ({
                  gap: theme.spacing.xs,
                  minHeight: TOUCH_TARGET,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Divider />
                <AppText size="xs" tone="faint">
                  {entry.task.key} · {entry.project.name} · {formatMinutes(entry.minutes)}
                </AppText>
                <AppText size="sm" numberOfLines={3}>
                  {entry.summary}
                </AppText>
              </Pressable>
            ))}
          </Card>
        )}
      />
    </Screen>
  );
}
