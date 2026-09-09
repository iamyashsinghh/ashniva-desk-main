import type {
  EmergencyFixStatus,
  IncidentDetail,
  IncidentLink,
  IncidentLinkKind,
  IncidentStatus,
  IncidentSummary,
  IncidentTimelineEntry,
  IncidentTimelineKind,
  Priority,
} from '@ashniva/types';

import type { IncidentDetailRow, IncidentSummaryRow } from './incidents.repository';

export function incidentKey(incident: { number: number }): string {
  return `INC-${incident.number}`;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const MINUTE_MS = 60_000;

/**
 * How long the impact lasted, or has lasted so far.
 *
 * Measured from `startedAt` rather than from when the incident record was made: the number the
 * review asks about is how long clients were affected, not how long somebody had a screen open.
 */
export function incidentDurationMinutes(
  incident: { startedAt: Date; resolvedAt: Date | null },
  now = new Date(),
): number {
  const end = incident.resolvedAt ?? now;
  return Math.max(0, Math.round((end.getTime() - incident.startedAt.getTime()) / MINUTE_MS));
}

export function toIncidentSummary(row: IncidentSummaryRow, now = new Date()): IncidentSummary {
  return {
    id: row.id,
    key: incidentKey(row),
    number: row.number,
    title: row.title,
    status: row.status as IncidentStatus,
    severity: row.severity as Priority,
    impact: row.impact,
    owner: row.owner,
    project: row.project,
    product: row.product,
    problemId: row.problemId,
    emergencyFixStatus: row.emergencyFixStatus as EmergencyFixStatus,
    startedAt: row.startedAt.toISOString(),
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: iso(row.resolvedAt),
    closedAt: iso(row.closedAt),
    durationMinutes: incidentDurationMinutes(row, now),
    createdAt: row.createdAt.toISOString(),
  };
}

function toTimelineEntry(row: IncidentDetailRow['timeline'][number]): IncidentTimelineEntry {
  return {
    id: row.id,
    kind: row.kind as IncidentTimelineKind,
    body: row.body,
    actor: row.actor,
    occurredAt: row.occurredAt.toISOString(),
  };
}

/**
 * The label a link renders with, without a second request.
 *
 * A link whose target has since been removed keeps its row and says so, rather than dropping
 * silently out of what the incident touched.
 */
function linkLabel(row: IncidentDetailRow['links'][number]): string {
  if (row.ticket) {
    return `T-${row.ticket.number}`;
  }
  if (row.task) {
    return `${row.task.project.code}-${row.task.number}`;
  }
  if (row.release) {
    return row.release.version;
  }
  return 'Removed';
}

function toIncidentLink(row: IncidentDetailRow['links'][number]): IncidentLink {
  return {
    id: row.id,
    kind: row.kind as IncidentLinkKind,
    entityId: row.ticketId ?? row.taskId ?? row.releaseId ?? '',
    label: linkLabel(row),
    addedBy: row.addedBy,
    addedAt: row.addedAt.toISOString(),
  };
}

/**
 * The whole incident, for an internal reader.
 *
 * `clientSummary` is carried even before it is published, because the person writing it has to be
 * able to see their own draft. It is `clientSummaryPublishedAt` that decides whether a client is
 * ever told, and no client shape maps this type at all.
 */
export function toIncidentDetail(row: IncidentDetailRow, now = new Date()): IncidentDetail {
  return {
    ...toIncidentSummary(row, now),
    description: row.description,
    internalNotes: row.internalNotes,
    clientSummary: row.clientSummary,
    clientSummaryPublishedAt: iso(row.clientSummaryPublishedAt),
    emergencyFixReason: row.emergencyFixReason,
    emergencyFixRequestedBy: row.emergencyFixRequestedBy,
    emergencyFixDecidedBy: row.emergencyFixDecidedBy,
    emergencyFixDecidedAt: iso(row.emergencyFixDecidedAt),
    timeline: row.timeline.map(toTimelineEntry),
    links: row.links.map(toIncidentLink),
    resolution: row.resolution,
  };
}
