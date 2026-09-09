import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser, DashboardResponse } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DASHBOARD_VIEW, DashboardsService } from './dashboards.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get()
  @ApiOperation({
    summary: 'Role-specific dashboard (management, senior, developer, tester, support, employee)',
  })
  get(@CurrentUser() actor: AuthenticatedUser): Promise<DashboardResponse> {
    return this.dashboards.forUser(actor);
  }

  /**
   * Managers and team leads only, and no permission decorator on purpose: this route carries
   * several sections that different keys guard, so the gate is per section inside the service —
   * one decorator here could only be right for one of them.
   */
  @Get('operations')
  @ApiOperation({
    summary:
      'Operational dashboard for managers and team leads: projects, today, team, time, support ' +
      'and the release pipeline, scoped by role and filtered by permission',
  })
  operations(@CurrentUser() actor: AuthenticatedUser): Promise<DashboardResponse> {
    return this.dashboards.forUser(actor, DASHBOARD_VIEW.OPERATIONS);
  }
}
