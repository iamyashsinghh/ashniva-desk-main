import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuditLogEntrySummary,
  type AuthenticatedUser,
  type PaginatedResponse,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuditLogRepository } from './audit-log.repository';
import { ListAuditLogsQueryDto } from './dto/audit-log-query.dto';

@ApiTags('Audit log')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly repository: AuditLogRepository) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_LOG_READ)
  @ApiOperation({ summary: 'Audit history (newest first) with type, person and date filters' })
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<PaginatedResponse<AuditLogEntrySummary>> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The audit history is internal');
    }
    const page = await this.repository.list({
      entityType: query.entityType,
      action: query.action,
      actorUserId: query.actorUserId,
      organizationId: query.organizationId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        actor: row.actor,
        organization: row.organization,
        before: row.before,
        after: row.after,
        ipAddress: row.ipAddress,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }
}
