import type { WorkLogSummary } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { Glyph } from '../../shared/components/glyph';
import { Icon, IconTile } from '../../shared/components/Icon';
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
import { PullRefresh } from '../../shared/components/PullRefresh';

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
    <View
      style={{
        gap: theme.spacing.md,
        padding: theme.spacing.screen,
        paddingBottom: theme.spacing.xs,
      }}
    >
      <Segmented options={TIME_RANGES} value={range} onChange={setRange} label="Which days" />
      {/*
        The headline is the whole sentence in one text node rather than a big bare figure beside
        it: a lone "2 h" would read as the same thing as a day's total, and a screen reader would
        hear a number with nothing to say what it counts.
      */}
      <Card style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.md }}>
        <IconTile name="time" tone="primary" size={44} solid />
        <AppText variant="heading" tabular style={{ flex: 1 }}>
          {formatMinutes(totalMinutes(entries))} logged
          {range === 'week' ? ' over the last seven days' : ' today'}
        </AppText>
      </Card>
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
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingTop: theme.spacing.sm,
        }}
        refreshControl={
          <PullRefresh
            busy={query.isRefetching}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="time-outline"
            title="Nothing logged"
            description={
              range === 'today'
                ? 'Time you log against a task today appears here.'
                : 'Time you log against a task appears here, by the day you did it.'
            }
          />
        }
        renderItem={({ item }) => (
          <Card style={{ gap: 0, paddingVertical: theme.spacing.md }}>
            <View
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.sm,
                paddingBottom: theme.spacing.sm,
              }}
            >
              <Icon name="calendar-outline" size={15} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" tone="muted" uppercase>
                  {formatDate(item.date) ?? item.date}
                </AppText>
              </View>
              <View
                style={{
                  backgroundColor: theme.colors.primarySoft,
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: theme.spacing.sm + 2,
                  paddingVertical: 2,
                }}
              >
                <AppText weight="bold" tone="primary" tabular>
                  {formatMinutes(item.minutes)}
                </AppText>
              </View>
            </View>
            {item.entries.map((entry) => (
              <View key={entry.id}>
                <Divider />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.task.key} ${formatMinutes(entry.minutes)}`}
                  accessibilityHint="Opens the task"
                  onPress={() => onOpenTask(entry.task.id)}
                  style={({ pressed }) => ({
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: theme.spacing.md,
                    minHeight: TOUCH_TARGET,
                    opacity: pressed ? 0.6 : 1,
                    paddingVertical: theme.spacing.sm,
                  })}
                >
                  <IconTile name="checkbox-outline" tone="teal" size={32} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText size="xs" tone="faint" numberOfLines={1}>
                      {entry.task.key} · {entry.project.name} · {formatMinutes(entry.minutes)}
                    </AppText>
                    <AppText size="sm" numberOfLines={3}>
                      {entry.summary}
                    </AppText>
                  </View>
                  <Glyph name="chevron-right" color={theme.colors.textFaint} size={12} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}
      />
    </Screen>
  );
}
