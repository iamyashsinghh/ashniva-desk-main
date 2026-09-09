import type { OrganizationRef, UserRef } from './identity';

export interface AuditLogEntrySummary {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: UserRef | null;
  organization: OrganizationRef | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdAt: string;
}
