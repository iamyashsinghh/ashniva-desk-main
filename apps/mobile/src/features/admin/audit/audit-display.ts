import { AUDIT_ENTITY_TYPE_LABELS, type AuditLogEntrySummary } from '@ashniva/types';

import type { QueryParams } from '../../../shared/api/client';
import type { SelectOption } from '../../../shared/components/SelectSheet';

export interface AuditFilters {
  entityType: string | null;
  actorUserId: string | null;
  /** `YYYY-MM-DD`, inclusive. */
  from: string | null;
  to: string | null;
}

export const NO_AUDIT_FILTERS: AuditFilters = {
  entityType: null,
  actorUserId: null,
  from: null,
  to: null,
};

export const ENTITY_TYPE_OPTIONS: SelectOption[] = Object.entries(AUDIT_ENTITY_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function entityTypeLabel(entityType: string): string {
  return (
    AUDIT_ENTITY_TYPE_LABELS[entityType as keyof typeof AUDIT_ENTITY_TYPE_LABELS] ?? entityType
  );
}

export function activeFilterCount(filters: AuditFilters): number {
  return Object.values(filters).filter(Boolean).length;
}

/**
 * The query the API reads. Dates become the whole day — from its first second to its last — in
 * UTC, as the web sends them, so the two clients agree on which entries a day holds.
 */
export function auditQuery(filters: AuditFilters, search: string): QueryParams {
  return {
    entityType: filters.entityType,
    actorUserId: filters.actorUserId,
    from: filters.from ? `${filters.from}T00:00:00Z` : null,
    to: filters.to ? `${filters.to}T23:59:59Z` : null,
    search: search || null,
  };
}

/** The first few plain fields of what the entry changed to: enough to tell rows apart. */
export function summarize(entry: AuditLogEntrySummary): string {
  const after = entry.after;
  if (typeof after !== 'object' || after === null) {
    return entry.entityId ?? '';
  }
  return Object.entries(after as Record<string, unknown>)
    .filter(
      ([, value]) =>
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    )
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

/** A before/after snapshot for reading, or null when there is nothing to show. */
export function formatSnapshot(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return null;
  }
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
