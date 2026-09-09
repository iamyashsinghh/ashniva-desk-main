import type {
  Priority,
  SlaEventKind,
  SlaEventSummary,
  SlaPolicySummary,
  TicketStatus,
} from '@ashniva/types';

import type { SlaPolicyRow } from './sla-policies.repository';

export function toSlaPolicySummary(row: SlaPolicyRow): SlaPolicySummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: row.isDefault,
    timezone: row.timezone,
    businessHoursStart: row.businessHoursStart,
    businessHoursEnd: row.businessHoursEnd,
    businessDays: row.businessDays,
    pauseStatuses: row.pauseStatuses as TicketStatus[],
    warningPercent: row.warningPercent,
    rules: row.rules.map((rule) => ({
      priority: rule.priority as Priority,
      firstResponseMinutes: rule.firstResponseMinutes,
      resolutionMinutes: rule.resolutionMinutes,
    })),
    clientOrganization: row.clientOrganization,
    project: row.project,
    ticketCount: row._count.tickets,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSlaEventSummary(row: {
  id: string;
  kind: string;
  detail: string | null;
  createdAt: Date;
}): SlaEventSummary {
  return {
    id: row.id,
    kind: row.kind as SlaEventKind,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}
