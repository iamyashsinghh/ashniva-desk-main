import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type DailyReportResponse } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { DailyReportHistoryQueryDto, DailyReportQueryDto } from './dto/report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Daily report for one person (defaults to you, today) — computed live' })
  daily(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DailyReportQueryDto,
  ): Promise<DailyReportResponse> {
    return this.reports.daily(actor, query.date, query.userId);
  }

  @Get('daily/team')
  @RequirePermissions(PERMISSIONS.REPORT_READ_TEAM)
  @ApiOperation({ summary: 'Daily reports of everyone you may see, for one day' })
  team(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DailyReportQueryDto,
  ): Promise<DailyReportResponse[]> {
    return this.reports.team(actor, query.date);
  }

  @Get('daily/history')
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Stored daily snapshots for a date range' })
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: DailyReportHistoryQueryDto,
  ): Promise<DailyReportResponse[]> {
    return this.reports.history(actor, query.userId, query.from, query.to);
  }
}
