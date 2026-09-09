import { SetMetadata } from '@nestjs/common';

export const AUDITED_KEY = 'audited';

export interface AuditedOptions {
  /** e.g. 'release.published' */
  action: string;
  /** e.g. 'release' */
  entityType: string;
  /** Route param that holds the entity id (default 'id'). Falls back to `result.id`. */
  entityIdParam?: string;
}

/**
 * Marks a controller handler as audited. AuditInterceptor writes one audit entry after the
 * handler succeeds. Services can also call AuditLogService.record() directly for finer detail.
 */
export const Audited = (options: AuditedOptions) => SetMetadata(AUDITED_KEY, options);
