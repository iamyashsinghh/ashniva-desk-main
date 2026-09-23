import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type SessionLogResponse,
} from '@ashniva/types';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SessionLogsService } from './session-logs.service';

class ListSessionLogsQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

@ApiTags('Session logs')
@ApiBearerAuth()
@Controller('session-logs')
export class SessionLogsController {
  constructor(private readonly sessions: SessionLogsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_READ_TEAM)
  @ApiOperation({
    summary:
      'Login / logout / break trail for developers, testers and interns (team or org scope)',
  })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListSessionLogsQueryDto,
  ): Promise<SessionLogResponse> {
    return this.sessions.list(actor, query);
  }
}
