import type { AiSummaryType, PortalAiSummary } from '@ashniva/types';

/**
 * What a client receives.
 *
 * A separate file with a separate input type, deliberately. It takes the narrow row the portal
 * repository query selects — which has no internal content, no sources, no runs and no review
 * trail — so there is nothing here to strip and nothing to forget.
 *
 * `clientContent` is the only text. A summary with none is not returned at all: the alternative
 * would be falling back to the internal text, which is exactly the mistake this module exists to
 * prevent.
 */

export interface PortalSummaryRow {
  id: string;
  type: AiSummaryType;
  title: string;
  projectId: string | null;
  periodStart: Date;
  periodEnd: Date;
  clientContent: string | null;
  publishedAt: Date | null;
}

export function toPortalSummary(row: PortalSummaryRow): PortalAiSummary | null {
  if (!row.clientContent || !row.publishedAt) {
    return null;
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    projectId: row.projectId,
    periodStart: row.periodStart.toISOString().slice(0, 10),
    periodEnd: row.periodEnd.toISOString().slice(0, 10),
    content: row.clientContent,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export function toPortalSummaries(rows: readonly PortalSummaryRow[]): PortalAiSummary[] {
  return rows
    .map(toPortalSummary)
    .filter((summary): summary is PortalAiSummary => summary !== null);
}
