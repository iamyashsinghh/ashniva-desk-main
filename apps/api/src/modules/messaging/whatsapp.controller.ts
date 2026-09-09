import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type ConnectionTestResult,
  type OutboundMessageSummary,
  type PaginatedResponse,
  type WhatsAppSettings,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { MessageResendService } from './message-resend.service';
import { MessageHistoryQueryDto } from './dto/email.dto';
import { SaveWhatsAppSettingsDto, SendWhatsAppTestDto } from './dto/whatsapp.dto';
import { toOutboundMessageSummary, toWhatsAppSettings } from './messaging.mapper';
import { WhatsAppService } from './whatsapp.service';

/**
 * WhatsApp configuration and delivery history.
 *
 * Neither the access token nor the app secret appears in a response: the settings shape carries
 * `hasAccessToken` and `hasAppSecret` booleans and no field the values could occupy.
 */
@ApiTags('WhatsApp')
@ApiBearerAuth()
@Controller('settings/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly resends: MessageResendService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({ summary: 'WhatsApp settings for this organization' })
  async settings(@CurrentUser() actor: AuthenticatedUser): Promise<WhatsAppSettings | null> {
    return toWhatsAppSettings(await this.whatsapp.settings(actor));
  }

  @Put()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({ summary: 'Save the WhatsApp settings' })
  async save(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveWhatsAppSettingsDto,
  ): Promise<WhatsAppSettings | null> {
    return toWhatsAppSettings(await this.whatsapp.saveSettings(actor, dto));
  }

  @Post('test-connection')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({
    summary: 'Read the configured number back from the provider',
    description: 'Proves the token, the id and the permission without messaging anybody.',
  })
  testConnection(@CurrentUser() actor: AuthenticatedUser): Promise<ConnectionTestResult> {
    return this.whatsapp.testConnection(actor);
  }

  @Post('test-message')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({ summary: 'Send one approved template, to check a mapping end to end' })
  sendTest(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SendWhatsAppTestDto,
  ): Promise<{ queued: boolean; message: string }> {
    return this.whatsapp.sendTest(actor, dto.template, dto.toPhone);
  }

  @Get('history')
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({
    summary: 'Recent outbound WhatsApp messages',
    description: 'Recipient numbers are masked; this is an operational log, not a directory.',
  })
  async history(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MessageHistoryQueryDto,
  ): Promise<PaginatedResponse<OutboundMessageSummary>> {
    const { items, nextCursor, total } = await this.whatsapp.history(actor, query);
    return { items: items.map(toOutboundMessageSummary), nextCursor, total };
  }

  /**
   * Send a failed message again.
   *
   * Its own permission, not `integration:manage`: resending is a decision about one client's
   * message, and it is the only outbound action a person takes rather than the system. A new row
   * is created rather than the failed one re-queued, so nothing that may already have arrived is
   * replayed — see `MessageResendService`.
   */
  @Post('history/:id/resend')
  @RequirePermissions(PERMISSIONS.COMMUNICATION_RESEND)
  @ApiOperation({
    summary: 'Send a failed message again',
    description: 'Creates a new message; the failed one stays in history. Audited.',
  })
  async resend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OutboundMessageSummary> {
    return toOutboundMessageSummary(await this.resends.resend(actor, id));
  }
}
