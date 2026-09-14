import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type ProjectWorkPlan } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ParseWorkPlanDto, SaveWorkPlanDto } from './dto/work-plan.dto';
import { WorkPlanService } from './work-plan.service';

@ApiTags('Project work plans')
@ApiBearerAuth()
@Controller('projects/:projectId/work-plan')
// Nest reloads this module after prisma generate so work-plan tables are on the client.
export class WorkPlanController {
  constructor(private readonly plans: WorkPlanService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'The project phase plan, with timers and on-time percentages' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.get(actor, projectId);
  }

  @Put()
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Replace the phase plan by hand' })
  save(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: SaveWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.save(actor, projectId, dto);
  }

  @Post('parse')
  @RequirePermissions(PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Read an uploaded PDF and divide it into phases' })
  parse(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: ParseWorkPlanDto,
  ): Promise<ProjectWorkPlan> {
    return this.plans.parse(actor, projectId, dto);
  }

  @Post('points/:pointId/start')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Reveal a point and start its timer' })
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.start(actor, projectId, pointId);
  }

  @Post('points/:pointId/complete')
  @RequirePermissions(PERMISSIONS.PROJECT_READ)
  @ApiOperation({ summary: 'Mark a started point done' })
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('pointId', ParseUUIDPipe) pointId: string,
  ): Promise<ProjectWorkPlan> {
    return this.plans.complete(actor, projectId, pointId);
  }
}
