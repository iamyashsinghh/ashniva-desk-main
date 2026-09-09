import type {
  ReportCell,
  ReportColumn,
  ReportFilters,
  ReportResult,
  ReportType,
} from '@ashniva/types';

import type { PrismaService } from '../../../database/prisma.service';

/**
 * Everything a report builder may know. The audience decides which columns exist at all: a
 * client report never carries assignees, estimates, costs or first-response performance.
 */
export interface ReportContext {
  prisma: PrismaService;
  /** The service-provider organization that owns every row. */
  organizationId: string;
  /** Pinned to the caller's organization for client users; a filter for staff. */
  clientOrganizationId?: string;
  audience: 'internal' | 'client';
  /** Staff without report:read-all only see these people (team-scoped reports). */
  visibleUserIds?: string[];
  /** Staff may see contract values / costs only with the matching permissions. */
  money: { value: boolean; cost: boolean };
  filters: ReportFilters;
  from: Date;
  to: Date;
  now: Date;
}

export type ReportRow = Record<string, ReportCell>;
export type ReportBuilder = (ctx: ReportContext) => Promise<ReportResult>;

export function column(
  key: string,
  label: string,
  kind: ReportColumn['kind'] = 'text',
): ReportColumn {
  return { key, label, kind };
}

export function dateCell(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function dateTimeCell(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function moneyCell(
  value: { toFixed(digits: number): string } | null | undefined,
): string | null {
  return value ? value.toFixed(2) : null;
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

export function finish(
  ctx: ReportContext,
  type: ReportType,
  title: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  totals: ReportResult['totals'],
): ReportResult {
  return {
    type,
    title,
    generatedAt: ctx.now.toISOString(),
    filters: {
      from: dateCell(ctx.from) ?? undefined,
      to: dateCell(ctx.to) ?? undefined,
      projectId: ctx.filters.projectId,
      clientOrganizationId: ctx.clientOrganizationId,
      contractId: ctx.filters.contractId,
      teamId: ctx.filters.teamId,
      userId: ctx.filters.userId,
      status: ctx.filters.status,
    },
    columns,
    rows,
    totals,
  };
}
