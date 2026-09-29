import { PERMISSIONS } from '@ashniva/types';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Segmented } from '../../shared/components/navigation-list';
import { UserPicker } from '../../shared/components/pickers';
import { AppText, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { todayIsoDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { DailyReportCard } from './DailyReportCard';
import { DayPicker } from './DayPicker';
import { useDailyReports, type DailyMode } from './use-daily-reports';

const EMPTY: Record<DailyMode, { title: string; description?: string }> = {
  mine: { title: 'No activity recorded for this day' },
  team: { title: 'No activity recorded for this day' },
  history: {
    title: 'No stored reports in this range',
    description:
      'Snapshots are stored when work is submitted, approved or logged, and every evening.',
  },
};

/**
 * Daily reports: generated from the day's work logs and completions — nothing to fill in.
 *
 * Three views, as on the web: one person's day (yours, or — for somebody who may read the team's
 * reports — anyone's), the whole team's day, and the last fourteen days of stored snapshots. The
 * API decides whose report may be read; the person picker is only drawn for somebody it would
 * answer for, so choosing a colleague never ends in a refusal.
 */
export function ReportsScreen({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const theme = useTheme();
  const { can } = useSession();
  const canRead = can(PERMISSIONS.REPORT_READ_OWN);
  const canSeeTeam = can(PERMISSIONS.REPORT_READ_TEAM);
  // The picker's roster is the assignee directory, which has its own permission.
  const canPickPerson = canSeeTeam && can(PERMISSIONS.TASK_READ);
  const [mode, setMode] = useState<DailyMode>('mine');
  const [date, setDate] = useState(todayIsoDate());
  const [userId, setUserId] = useState<string | null>(null);
  const daily = useDailyReports(mode, date, canPickPerson ? userId : null, {
    canRead,
    canSeeTeam,
  });

  if (!canRead) {
    return <NotAvailable />;
  }

  const modes = [
    { value: 'mine' as const, label: canSeeTeam ? 'One person' : 'My report' },
    ...(canSeeTeam ? [{ value: 'team' as const, label: 'Team' }] : []),
    { value: 'history' as const, label: 'Last 14 days' },
  ];

  const header = (
    <View style={{ gap: theme.spacing.md }}>
      <AppText size="sm" tone="muted">
        Generated from work logs and completions. A snapshot is stored at 18:30 IST; until then the
        report is live.
      </AppText>
      <Segmented label="Which report" options={modes} value={mode} onChange={setMode} />
      <DayPicker label={mode === 'history' ? 'Up to' : 'Day'} value={date} onChange={setDate} />
      {canPickPerson && mode !== 'team' ? (
        <UserPicker
          label="Person"
          value={userId ? [userId] : []}
          onChange={(ids) => setUserId(ids[0] ?? null)}
          placeholder="Me"
        />
      ) : null}
    </View>
  );

  let empty = (
    <EmptyState
      icon="calendar-outline"
      title={EMPTY[mode].title}
      {...(EMPTY[mode].description ? { description: EMPTY[mode].description } : {})}
    />
  );
  if (daily.isLoading) {
    empty = <LoadingState label="Loading reports" />;
  } else if (daily.error) {
    empty = (
      <ErrorState
        message={errorMessage(daily.error)}
        offline={daily.error instanceof Error && daily.error.name === 'NetworkError'}
        onRetry={daily.refetch}
      />
    );
  }

  return (
    <Screen>
      <FlatList
        data={daily.error ? [] : daily.reports}
        keyExtractor={(report) => `${report.userId}-${report.reportDate}`}
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={<PullRefresh busy={daily.isRefetching} onRefresh={daily.refetch} />}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: theme.spacing.xs }}
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <DailyReportCard report={item} compact={mode === 'history'} onOpenTask={onOpenTask} />
        )}
      />
    </Screen>
  );
}

/** For a deep link reaching somebody the menu would not have shown the screen to. */
export function NotAvailable() {
  return (
    <Screen>
      <EmptyState
        icon="lock-closed-outline"
        title="Not available"
        description="Reports need the report:read-own permission."
      />
    </Screen>
  );
}
