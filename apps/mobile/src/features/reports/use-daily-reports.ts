import type { DailyReportResponse } from '@ashniva/types';

import { useDailyReport, useReportHistory, useTeamReports } from './api';
import { shiftIsoDate } from './report-format';

export type DailyMode = 'mine' | 'team' | 'history';

/** The history view looks back two weeks from the chosen day, as the web's does. */
const HISTORY_DAYS = 14;

export interface DailyReports {
  reports: DailyReportResponse[];
  isLoading: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * The three views of the daily report behind one shape, so the screen renders one list.
 *
 * Only the view on screen is fetched: the team view is a request per person on the server, and
 * paying for it while somebody reads their own day would be waste.
 */
export function useDailyReports(
  mode: DailyMode,
  date: string,
  userId: string | null,
  access: { canRead: boolean; canSeeTeam: boolean },
): DailyReports {
  const mine = useDailyReport(date, userId, access.canRead && mode === 'mine');
  const team = useTeamReports(date, access.canSeeTeam && mode === 'team');
  const history = useReportHistory(
    shiftIsoDate(date, -(HISTORY_DAYS - 1)),
    date,
    userId,
    access.canRead && mode === 'history',
  );

  if (mode === 'mine') {
    return {
      reports: mine.data ? [mine.data] : [],
      isLoading: mine.isLoading,
      isRefetching: mine.isRefetching,
      error: mine.error,
      refetch: () => void mine.refetch(),
    };
  }
  const query = mode === 'team' ? team : history;
  return {
    reports: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
