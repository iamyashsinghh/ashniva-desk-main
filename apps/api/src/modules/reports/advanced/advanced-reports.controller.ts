import { Controller, ForbiddenException, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type ReportResult } from '@ashniva/types';
import type { Response } from 'express';

import { isInternalUser } from '../../../common/auth/access-scope';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ReportFiltersDto } from '../dto/advanced-report.dto';
import { AdvancedReportsService, type ReportTypeInfo } from './advanced-reports.service';

/** Client organizations use /portal/reports; the staff routes never serve them. */
function internalOnly(actor: AuthenticatedUser): void {
  if (!isInternalUser(actor)) {
    throw new ForbiddenException('Use the client portal reports');
  }
}

function sendCsv(res: Response, file: { filename: string; csv: string }): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(file.csv);
}

/** Staff side of the Phase 2 reports. Authorization and scoping happen in the service. */
@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports/advanced')
export class AdvancedReportsController {
  constructor(private readonly reports: AdvancedReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Reports the caller may run' })
  available(@CurrentUser() actor: AuthenticatedUser): Promise<ReportTypeInfo[]> {
    internalOnly(actor);
    return this.reports.available(actor);
  }

  @Get(':type')
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Run a report (JSON columns + rows + totals)' })
  run(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('type') type: string,
    @Query() filters: ReportFiltersDto,
  ): Promise<ReportResult> {
    internalOnly(actor);
    return this.reports.run(actor, type, filters);
  }

  @Get(':type/export')
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'The same report as CSV (audited)' })
  async exportCsv(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('type') type: string,
    @Query() filters: ReportFiltersDto,
    @Res() res: Response,
  ): Promise<void> {
    internalOnly(actor);
    sendCsv(res, await this.reports.exportCsv(actor, type, filters));
  }
}

/** Client portal: the client-safe subset, pinned to the caller's organization. */
@ApiTags('Client portal')
@ApiBearerAuth()
@Controller('portal/reports')
export class PortalReportsController {
  constructor(private readonly reports: AdvancedReportsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Reports available to your organization' })
  available(@CurrentUser() actor: AuthenticatedUser): Promise<ReportTypeInfo[]> {
    return this.reports.available(actor);
  }

  @Get(':type')
  @RequirePermissions(PERMISSIONS.REPORT_READ_OWN)
  @ApiOperation({ summary: 'Run a report over your organization’s client-visible data' })
  run(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('type') type: string,
    @Query() filters: ReportFiltersDto,
  ): Promise<ReportResult> {
    return this.reports.run(actor, type, filters);
  }

  @Get(':type/export')
  @RequirePermissions(PERMISSIONS.REPORT_EXPORT)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'CSV export (audited)' })
  async exportCsv(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('type') type: string,
    @Query() filters: ReportFiltersDto,
    @Res() res: Response,
  ): Promise<void> {
    sendCsv(res, await this.reports.exportCsv(actor, type, filters));
  }
}
