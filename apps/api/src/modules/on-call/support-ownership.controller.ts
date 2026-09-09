import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type AvailabilitySummary,
  type OnCallEntrySummary,
  type ProjectSupportConfig,
  type SupportOwnershipSummary,
  type WorkScheduleSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  SetAvailabilityDto,
  SetOnCallDto,
  SetSupportOwnershipDto,
  SetWorkScheduleDto,
} from './dto/support-ownership.dto';
import { SupportOwnershipService } from './support-ownership.service';

/**
 * Configuring who covers support, when people work, and who is available now.
 *
 * Everything that writes or reads somebody else's rota needs `support-routing:manage`, which
 * ships to Super Admin, Project Manager and Team Lead. A developer holds none of it and reaches
 * only `GET /me/work-schedule`, which returns their own shift and nothing about the team — seeing
 * your own hours is not a management view, and this is the seam where that stays true.
 */
@ApiTags('Support routing')
@ApiBearerAuth()
@Controller()
export class SupportOwnershipController {
  constructor(private readonly support: SupportOwnershipService) {}

  @Get('projects/:id/support-config')
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Support ownership, on-call cover and the team’s current availability' })
  config(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
  ): Promise<ProjectSupportConfig> {
    return this.support.configFor(actor, projectId);
  }

  @Put('projects/:id/support-ownership')
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Set who owns this project’s support and its module owners' })
  saveOwnership(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: SetSupportOwnershipDto,
  ): Promise<SupportOwnershipSummary> {
    return this.support.saveOwnership(actor, projectId, dto);
  }

  @Put('projects/:id/on-call')
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Put somebody on call for one date, replacing whoever was' })
  setOnCall(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: SetOnCallDto,
  ): Promise<OnCallEntrySummary> {
    return this.support.setOnCall(actor, projectId, dto);
  }

  @Delete('projects/:id/on-call/:onDate')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Remove on-call cover for one date' })
  clearOnCall(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) projectId: string,
    @Param('onDate') onDate: string,
  ): Promise<void> {
    return this.support.clearOnCall(actor, projectId, onDate);
  }

  @Put('users/:id/work-schedule')
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({ summary: 'Set somebody’s working days, shift and timezone' })
  saveSchedule(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: SetWorkScheduleDto,
  ): Promise<WorkScheduleSummary> {
    return this.support.saveSchedule(actor, userId, dto);
  }

  /**
   * The seam Ashniva HR writes through: attendance, login and approved leave arrive here as facts,
   * with a `source` of `HR`. Desk never reads HR's database, so this endpoint is the entire
   * contract between the two systems.
   */
  @Patch('users/:id/availability')
  @RequirePermissions(PERMISSIONS.SUPPORT_ROUTING_MANAGE)
  @ApiOperation({
    summary: 'Record whether somebody is available, on leave or outside their hours',
  })
  setAvailability(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: SetAvailabilityDto,
  ): Promise<AvailabilitySummary> {
    return this.support.setAvailability(actor, userId, dto);
  }

  @Get('me/work-schedule')
  @ApiOperation({ summary: 'Your own working week. Returns null when nobody has configured one.' })
  mySchedule(@CurrentUser() actor: AuthenticatedUser): Promise<WorkScheduleSummary | null> {
    return this.support.mySchedule(actor);
  }
}
