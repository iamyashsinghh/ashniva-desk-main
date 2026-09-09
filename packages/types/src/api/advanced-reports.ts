import type { ReportType } from '../domain/report-type';

/** A tabular report: column definitions plus rows of primitives, ready for a table or CSV. */
export interface ReportColumn {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'percent' | 'minutes' | 'date' | 'datetime' | 'money' | 'status';
}

export type ReportCell = string | number | boolean | null;

export interface ReportResult {
  type: ReportType;
  title: string;
  generatedAt: string;
  filters: Record<string, string | undefined>;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
  /** Headline numbers shown above the table. */
  totals: Array<{ label: string; value: string | number }>;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  projectId?: string;
  clientOrganizationId?: string;
  contractId?: string;
  teamId?: string;
  userId?: string;
  status?: string;
}
