import type { ReportFilters, ReportResult, ReportType } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';

import { apiBlob, apiRequest, buildQuery } from '../../shared/lib/api-client';

export interface ReportTypeInfo {
  type: ReportType;
  label: string;
}

const base = (portal: boolean) => (portal ? '/portal/reports' : '/reports/advanced');

export function useAvailableReportsQuery(portal: boolean) {
  return useQuery({
    queryKey: ['reports', 'advanced', 'available', portal],
    queryFn: () => apiRequest<ReportTypeInfo[]>(base(portal)),
  });
}

export function useAdvancedReportQuery(
  type: ReportType | undefined,
  filters: ReportFilters,
  portal: boolean,
) {
  return useQuery({
    queryKey: ['reports', 'advanced', portal, type, filters],
    queryFn: () => apiRequest<ReportResult>(`${base(portal)}/${type}`, { query: { ...filters } }),
    enabled: Boolean(type),
  });
}

/** CSV export goes through the API (audited there) and is saved from a blob, never a bare link. */
export async function downloadReportCsv(
  type: ReportType,
  filters: ReportFilters,
  portal: boolean,
): Promise<void> {
  const blob = await apiBlob(`${base(portal)}/${type}/export${buildQuery({ ...filters })}`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
