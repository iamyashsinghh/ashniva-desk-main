import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  REAUTH_HEADER,
  type AuthenticatedUser,
  type IntegrationConnectionDetail,
  type IntegrationConnectionSummary,
  type IntegrationEventSummary,
  type ValidationResult,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { RequireRecentAuth } from '../../common/decorators/require-recent-auth.decorator';
import {
  ConnectIntegrationDto,
  ListEventsQueryDto,
  ProviderParamDto,
  UpdateIntegrationDto,
} from './dto/integration.dto';
import { IntegrationsService } from './integrations.service';

/**
 * Integration connections. Connecting and disconnecting move a credential, so both sit behind
 * `integration:manage` and a fresh password check, the same bar Phase 2 set for role and
 * hour-ledger changes.
 */
@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({ summary: 'Integration connections and their status (never their credentials)' })
  list(@CurrentUser() actor: AuthenticatedUser): Promise<IntegrationConnectionSummary[]> {
    return this.integrations.list(actor);
  }

  @Get('events')
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({ summary: 'Recent inbound webhook events (payloads are never stored)' })
  events(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListEventsQueryDto,
  ): Promise<IntegrationEventSummary[]> {
    return this.integrations.listEvents(actor, query.provider);
  }

  @Get(':provider')
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({ summary: 'One integration connection' })
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: ProviderParamDto,
  ): Promise<IntegrationConnectionDetail> {
    return this.integrations.get(actor, params.provider);
  }

  @Post(':provider/connect')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @RequireRecentAuth()
  @ApiHeader({ name: REAUTH_HEADER, required: true })
  @ApiOperation({ summary: 'Store a provider credential (encrypted) and validate it' })
  connect(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: ProviderParamDto,
    @Body() dto: ConnectIntegrationDto,
  ): Promise<IntegrationConnectionDetail> {
    return this.integrations.connect(actor, params.provider, dto);
  }

  @Post(':provider/validate')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({ summary: 'Re-check the stored credential against the provider' })
  validate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: ProviderParamDto,
  ): Promise<ValidationResult> {
    return this.integrations.validate(actor, params.provider);
  }

  @Patch(':provider')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({ summary: 'Enable, disable or relabel a connection' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: ProviderParamDto,
    @Body() dto: UpdateIntegrationDto,
  ): Promise<IntegrationConnectionDetail> {
    return this.integrations.update(actor, params.provider, dto);
  }

  @Delete(':provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @RequireRecentAuth()
  @ApiHeader({ name: REAUTH_HEADER, required: true })
  @ApiOperation({
    summary: 'Disconnect: wipe the credentials, keep the connection and its history',
  })
  disconnect(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: ProviderParamDto,
  ): Promise<void> {
    return this.integrations.disconnect(actor, params.provider);
  }
}
