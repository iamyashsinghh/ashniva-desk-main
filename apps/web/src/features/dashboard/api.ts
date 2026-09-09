import type { DashboardResponse, OperationsDashboard } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../shared/lib/api-client';

export const dashboardKey = ['dashboard'] as const;
export const operationsDashboardKey = ['dashboard', 'operations'] as const;

/**
 * The role dashboard.
 *
 * `enabled` exists so the two panels do not both poll. A manager reading the Operations tab was
 * refetching this one every minute as well — two dashboards' worth of queries for one screen, and
 * the more expensive of the two was the one nobody was looking at.
 */
export function useDashboardQuery(enabled = true) {
  return useQuery({
    queryKey: dashboardKey,
    queryFn: () => apiRequest<DashboardResponse>('/dashboard'),
    refetchInterval: 60 * 1000,
    enabled,
  });
}

/**
 * The operational view, for managers and team leads.
 *
 * `enabled` is a rendering decision only — the API refuses the route for anybody else and decides
 * for itself which sections the caller may see. Asking for it from the wrong screen would be a
 * wasted request, never a leak.
 */
export function useOperationsDashboardQuery(enabled: boolean) {
  return useQuery({
    queryKey: operationsDashboardKey,
    queryFn: () => apiRequest<OperationsDashboard>('/dashboard/operations'),
    refetchInterval: 60 * 1000,
    enabled,
  });
}
