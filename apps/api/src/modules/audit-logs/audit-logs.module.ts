import { Global, Module } from '@nestjs/common';

import { AuditInterceptor } from './audit.interceptor';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogRepository } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';

/**
 * Immutable who/what/when record of sensitive actions. Global so any service can inject
 * AuditLogService. `GET /audit-logs` feeds the Audit History screen.
 */
@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogRepository, AuditLogService, AuditInterceptor],
  exports: [AuditLogService, AuditLogRepository],
})
export class AuditLogsModule {}
