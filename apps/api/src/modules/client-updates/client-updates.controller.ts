import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuthenticatedUser, type ClientUpdateSummary } from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ClientUpdatesService } from './client-updates.service';
import { EditClientUpdateDto, ListClientUpdatesQueryDto } from './dto/client-update.dto';

@ApiTags('Client updates')
@ApiBearerAuth()
@Controller('client-updates')
export class ClientUpdatesController {
  constructor(private readonly updates: ClientUpdatesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TASK_READ)
  @ApiOperation({ summary: 'Publish queue and published updates (Completed Today)' })
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListClientUpdatesQueryDto,
  ): Promise<ClientUpdateSummary[]> {
    return this.updates.list(actor, query);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CLIENT_UPDATE_PUBLISH)
  @ApiOperation({ summary: 'Edit the text the client will read (before publishing)' })
  edit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditClientUpdateDto,
  ): Promise<ClientUpdateSummary> {
    return this.updates.edit(actor, id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.CLIENT_UPDATE_PUBLISH)
  @ApiOperation({ summary: 'Publish the update to the client portal' })
  publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClientUpdateSummary> {
    return this.updates.publish(actor, id);
  }

  @Post(':id/withdraw')
  @RequirePermissions(PERMISSIONS.CLIENT_UPDATE_PUBLISH)
  @ApiOperation({ summary: 'Withdraw a pending or published update' })
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClientUpdateSummary> {
    return this.updates.withdraw(actor, id);
  }
}
