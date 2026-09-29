import { PERMISSIONS, type SessionLogResponse } from '@ashniva/types';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage, isOffline } from '../../shared/api/client';
import { useResource } from '../../shared/api/queries';
import { AppText, Screen } from '../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { SessionLogFilters, type SessionLogView } from './SessionLogFilters';
import { PersonSessionsCard, SessionEventRow, TeamTotalsCard } from './SessionLogRows';
import {
  groupByPerson,
  presetRange,
  sessionLogQuery,
  teamTotals,
  type DayRange,
  type RangePreset,
} from './session-log-display';
import { PullRefresh } from '../../shared/components/PullRefresh';

const EMPTY: SessionLogResponse = { events: [], sessions: [] };

/**
 * Team login & break log — the web's `/team/session-logs`.
 *
 * When developers, testers and interns signed in and out, and how long the gaps were. The API
 * decides whose trail the caller may read (their teams, or the organization with
 * `report:read-all`); the screen only avoids asking without `report:read-team`, where the answer
 * would always be a 403.
 *
 * It opens on the last seven days rather than the web's unbounded default: the API returns up to
 * two thousand events for an open range, which is a lot to pull over a phone connection to answer
 * what is nearly always a question about this week. "Any time" is one tap away.
 */
export function SessionLogsScreen() {
  const theme = useTheme();
  const { can } = useSession();
  const allowed = can(PERMISSIONS.REPORT_READ_TEAM);
  const [view, setView] = useState<SessionLogView>('sessions');
  const [preset, setPreset] = useState<RangePreset>('week');
  const [range, setRange] = useState<DayRange>(() => presetRange('week'));
  const [userId, setUserId] = useState<string | null>(null);

  const query = useMemo(() => sessionLogQuery({ userId, ...range }), [userId, range]);
  const logs = useResource<SessionLogResponse>(['session-logs', query], '/session-logs', {
    enabled: allowed,
    query,
  });
  const data = logs.data ?? EMPTY;
  const groups = useMemo(() => groupByPerson(data.sessions), [data.sessions]);
  const totals = useMemo(() => teamTotals(groups), [groups]);

  if (!allowed) {
    return (
      <Screen>
        <EmptyState
          icon="lock-closed-outline"
          title="Not available"
          description="The team login & break log needs permission to read your team's reports."
        />
      </Screen>
    );
  }

  const choosePreset = (next: RangePreset) => {
    setPreset(next);
    if (next !== 'custom') {
      setRange(presetRange(next));
    }
  };

  const header = (
    <View style={{ gap: theme.spacing.md, padding: theme.spacing.screen, paddingBottom: 0 }}>
      <AppText size="sm" tone="muted">
        When developers, testers and interns signed in and out.
      </AppText>
      <SessionLogFilters
        view={view}
        onViewChange={setView}
        preset={preset}
        onPresetChange={choosePreset}
        range={range}
        onRangeChange={setRange}
        userId={userId}
        onUserChange={setUserId}
      />
    </View>
  );

  if (logs.isLoading) {
    return (
      <Screen>
        {header}
        <LoadingState label="Loading the log" />
      </Screen>
    );
  }

  if (logs.error && !logs.data) {
    return (
      <Screen>
        {header}
        <ErrorState
          message={errorMessage(logs.error)}
          offline={isOffline(logs.error)}
          onRetry={() => void logs.refetch()}
        />
      </Screen>
    );
  }

  const refresh = (
    <PullRefresh
      busy={logs.isRefetching}
      onRefresh={() => void logs.refetch()}
      tintColor={theme.colors.primary}
    />
  );
  const listStyle = { gap: theme.spacing.md, padding: theme.spacing.screen };
  const empty = (
    <EmptyState
      icon="log-in-outline"
      title={view === 'sessions' ? 'No sessions yet' : 'No events yet'}
      description="Login and logout events for your team will appear here."
    />
  );

  return (
    <Screen>
      {header}
      {view === 'sessions' ? (
        <FlatList
          data={groups}
          keyExtractor={(group) => group.user.id}
          contentContainerStyle={listStyle}
          refreshControl={refresh}
          ListHeaderComponent={groups.length > 0 ? <TeamTotalsCard totals={totals} /> : null}
          ListEmptyComponent={empty}
          renderItem={({ item }) => <PersonSessionsCard group={item} />}
        />
      ) : (
        <FlatList
          data={data.events}
          keyExtractor={(event) => event.id}
          contentContainerStyle={listStyle}
          refreshControl={refresh}
          ListEmptyComponent={empty}
          renderItem={({ item }) => <SessionEventRow event={item} />}
        />
      )}
    </Screen>
  );
}
