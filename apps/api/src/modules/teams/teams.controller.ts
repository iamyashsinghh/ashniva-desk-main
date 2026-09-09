import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type TeamSummary } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../common/decorators/require-permissions.decorator';
import { CreateTeamDto, SetTeamMembersDto, UpdateTeamDto } from './dto/team.dto';
import { TeamsService } from './teams.service';

@ApiTags('Teams')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  /**
   * The two screens that need a team list are Users & teams (`user:manage`) and the project form's
   * team picker (`project:manage`), and neither key implies the other, so either is enough.
   *
   * Ungated, this answered every authenticated caller with the full internal org chart — every
   * team, its lead and every member's name and email — to a developer, a tester and an internal
   * employee alike.
   */
  @Get()
  @RequireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'Teams of your organization with lead and members' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<TeamSummary[]> {
    return this.teams.list(actor);
  }

  @Get(':id')
  @RequireAnyPermission(PERMISSIONS.USER_MANAGE, PERMISSIONS.PROJECT_MANAGE)
  @ApiOperation({ summary: 'One team' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeamSummary> {
    return this.teams.get(actor, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Create a team' })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
  ): Promise<TeamSummary> {
    return this.teams.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Rename a team or change its lead' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamDto,
  ): Promise<TeamSummary> {
    return this.teams.update(actor, id, dto);
  }

  @Put(':id/members')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Replace the member list' })
  setMembers(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTeamMembersDto,
  ): Promise<TeamSummary> {
    return this.teams.setMembers(actor, id, dto);
  }
}
