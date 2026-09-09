import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { AuditLogRepository, type AuditLogEntry } from './audit-log.repository';

export type RecordAuditInput = Omit<AuditLogEntry, 'organizationId' | 'actorUserId' | 'requestId'> &
  Partial<Pick<AuditLogEntry, 'organizationId' | 'actorUserId' | 'requestId'>>;

/**
 * Writes audit entries for sensitive actions (status changes, credential access, approvals,
 * deployments, overrides, preview-as sessions). Actor, organization and request id default to
 * the current tenant context. A failed audit write is logged but never breaks the request.
 */
@Injectable()
export class AuditLogService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly tenantContext: TenantContextService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditLogService.name);
  }

  async record(input: RecordAuditInput): Promise<void> {
    const context = this.tenantContext.get();
    const entry: AuditLogEntry = {
      ...input,
      organizationId: input.organizationId ?? context?.organizationId,
      actorUserId: input.actorUserId ?? context?.userId,
      requestId: input.requestId ?? context?.requestId,
    };

    try {
      await this.repository.append(entry);
    } catch (error) {
      this.logger.error({ err: error, action: entry.action }, 'Failed to write audit log entry');
    }
  }
}
