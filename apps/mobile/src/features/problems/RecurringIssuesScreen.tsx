import {
  PERMISSIONS,
  RECURRING_GROUP_BY,
  RECURRING_GROUP_BY_LABELS,
  type RecurringGroupBy,
  type RecurringGroupRow,
  type RecurringReport,
} from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useResource } from '../../shared/api/queries';
import { Chip, ChipScroller } from '../../shared/components/chips';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { QueryState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { problemKeys } from './problem-api';
import { ProblemFormSheet, type ProblemDraft } from './ProblemFormSheet';
import { RecurringRow } from './recurring/RecurringRow';

const GROUPINGS = Object.values(RECURRING_GROUP_BY).map((value) => ({
  value,
  label: RECURRING_GROUP_BY_LABELS[value],
}));
const WINDOWS = [7, 30, 90] as const;

function draftFrom(row: RecurringGroupRow, windowDays: number): ProblemDraft {
  return {
    title: row.label,
    description: `${row.ticketCount} tickets from ${row.clientCount} clients in the last ${windowDays} days.`,
    ...(row.severity ? { severity: row.severity } : {}),
    ...(row.module ? { module: row.module } : {}),
    ...(row.productId ? { productId: row.productId } : {}),
  };
}

/**
 * What keeps coming back, and to how many separate clients.
 *
 * Every count on the report covers the one window asked for, so a row over the threshold is one
 * separate clients hit recently. A group nobody has opened a problem for can be promoted from here
 * by somebody who may open problems — the web leaves that to the problems list.
 */
export function RecurringIssuesScreen({
  onOpenProblem,
}: {
  onOpenProblem: (problemId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const [by, setBy] = useState<RecurringGroupBy>(RECURRING_GROUP_BY.MODULE);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [promoting, setPromoting] = useState<RecurringGroupRow | null>(null);
  const params = { by, windowDays };
  const query = useResource<RecurringReport>(problemKeys.recurring(params), '/reports/recurring', {
    query: params,
  });
  const report = query.data;
  const busiest = Math.max(1, ...(report?.rows.map((row) => row.ticketCount) ?? [1]));
  const canPromote = can(PERMISSIONS.PROBLEM_MANAGE);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.spacing.md,
          padding: theme.spacing.screen,
          paddingBottom: theme.spacing.xxl,
        }}
        refreshControl={
          <PullRefresh busy={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
      >
        <Segmented label="Group by" options={GROUPINGS} value={by} onChange={setBy} />
        <ChipScroller>
          {WINDOWS.map((days) => (
            <Chip
              key={days}
              label={`Last ${days} days`}
              selected={windowDays === days}
              onPress={() => setWindowDays(days)}
            />
          ))}
        </ChipScroller>
        {report ? (
          <AppText size="xs" tone="faint">
            Client counts are separate companies, never tickets · threshold {report.threshold}
          </AppText>
        ) : null}
        <QueryState
          isLoading={query.isLoading}
          error={query.error}
          isEmpty={report?.rows.length === 0}
          emptyTitle="Nothing is recurring"
          emptyDescription="No group of tickets has been reported by more than one client yet."
          emptyIcon="repeat-outline"
          onRetry={() => void query.refetch()}
          loadingLabel="Loading recurring issues"
        >
          <View style={{ gap: theme.spacing.md }}>
            {report?.rows.map((row) => (
              <RecurringRow
                key={row.label}
                row={row}
                busiest={busiest}
                windowDays={report.windowDays}
                onOpenProblem={onOpenProblem}
                {...(canPromote ? { onPromote: () => setPromoting(row) } : {})}
              />
            ))}
          </View>
        </QueryState>
      </ScrollView>
      {promoting ? (
        <ProblemFormSheet
          draft={draftFrom(promoting, windowDays)}
          onClose={() => setPromoting(null)}
          onSaved={(problem) => {
            setPromoting(null);
            onOpenProblem(problem.id);
          }}
        />
      ) : null}
    </Screen>
  );
}
