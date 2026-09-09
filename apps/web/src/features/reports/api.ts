import type { AuditLogEntrySummary, DailyReportResponse, PaginatedResponse } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export function useDailyReportQuery(date: string, userId?: string) {
  return useQuery({
    queryKey: ['reports', 'daily', date, userId ?? 'me'],
    queryFn: () => apiRequest<DailyReportResponse>('/reports/daily', { query: { date, userId } }),
  });
}

export function useTeamReportsQuery(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'team', date],
    queryFn: () => apiRequest<DailyReportResponse[]>('/reports/daily/team', { query: { date } }),
    enabled,
  });
}

export function useReportHistoryQuery(from: string, to: string, userId?: string) {
  return useQuery({
    queryKey: ['reports', 'history', from, to, userId ?? 'me'],
    queryFn: () =>
      apiRequest<DailyReportResponse[]>('/reports/daily/history', { query: { from, to, userId } }),
  });
}

export interface AuditParams {
  entityType?: string;
  actorUserId?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export function useAuditLogsQuery(params: AuditParams) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () =>
      apiRequest<PaginatedResponse<AuditLogEntrySummary>>('/audit-logs', {
        query: { ...params, limit: params.limit ?? 100 },
      }),
  });
}
