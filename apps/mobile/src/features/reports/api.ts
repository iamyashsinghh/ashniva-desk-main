import type { DailyReportResponse, ReportFilters, ReportResult, ReportType } from '@ashniva/types';

import { useResource } from '../../shared/api/queries';

/**
 * Reads for the daily and the advanced reports.
 *
 * Every report is computed and scoped on the server — who may see whose day, which report types a
 * role may run — so these hooks only ask. Nothing is filtered or totalled on the phone.
 */

export interface ReportTypeInfo {
  type: ReportType;
  label: string;
}

export const reportKeys = {
  all: ['reports'] as const,
  daily: (date: string, userId: string | null) =>
    ['reports', 'daily', date, userId ?? 'me'] as const,
  team: (date: string) => ['reports', 'team', date] as const,
  history: (from: string, to: string, userId: string | null) =>
    ['reports', 'history', from, to, userId ?? 'me'] as const,
  available: ['reports', 'advanced', 'available'] as const,
  advanced: (type: ReportType | null, filters: ReportFilters) =>
    ['reports', 'advanced', type, filters] as const,
};

export function useDailyReport(date: string, userId: string | null, enabled: boolean) {
  return useResource<DailyReportResponse>(reportKeys.daily(date, userId), '/reports/daily', {
    enabled,
    query: { date, userId },
  });
}

export function useTeamReports(date: string, enabled: boolean) {
  return useResource<DailyReportResponse[]>(reportKeys.team(date), '/reports/daily/team', {
    enabled,
    query: { date },
  });
}

export function useReportHistory(
  from: string,
  to: string,
  userId: string | null,
  enabled: boolean,
) {
  return useResource<DailyReportResponse[]>(
    reportKeys.history(from, to, userId),
    '/reports/daily/history',
    { enabled, query: { from, to, userId } },
  );
}

/** Which advanced reports this person may run; the API decides by role and permission. */
export function useAvailableReports(enabled: boolean) {
  return useResource<ReportTypeInfo[]>(reportKeys.available, '/reports/advanced', { enabled });
}

export function useAdvancedReport(type: ReportType | null, filters: ReportFilters) {
  return useResource<ReportResult>(
    reportKeys.advanced(type, filters),
    `/reports/advanced/${type}`,
    {
      enabled: type !== null,
      query: { ...filters },
    },
  );
}
