import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type WorkLogSummary } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ListWorkLogsQueryDto } from './dto/work-log.dto';
import { WorkLogsService } from './work-logs.service';

@ApiTags('Work logs')
@ApiBearerAuth()
@Controller('work-logs')
export class WorkLogsController {
  constructor(private readonly workLogs: WorkLogsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Time entries you are allowed to see (own, team or everyone)' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListWorkLogsQueryDto,
  ): Promise<WorkLogSummary[]> {
    return this.workLogs.list(actor, query);
  }
}
