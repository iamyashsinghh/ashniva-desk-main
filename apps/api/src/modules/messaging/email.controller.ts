import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type ConnectionTestResult,
  type EmailSettings,
  type OutboundMessageSummary,
  type PaginatedResponse,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { MessageResendService } from './message-resend.service';
import { MessageHistoryQueryDto, SaveEmailSettingsDto } from './dto/email.dto';
import { EmailService } from './email.service';
import { toEmailSettings, toOutboundMessageSummary } from './messaging.mapper';

/**
 * Email configuration and delivery history.
 *
 * The stored password never appears in a response: the settings shape has a `hasPassword`
 * boolean and no field that could carry the value itself.
 */
@ApiTags('Email')
@ApiBearerAuth()
@Controller('settings/email')
export class EmailController {
  constructor(
    private readonly email: EmailService,
    private readonly resends: MessageResendService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({ summary: 'Email settings for this organization' })
  async settings(@CurrentUser() actor: AuthenticatedUser): Promise<EmailSettings | null> {
    return toEmailSettings(await this.email.settings(actor));
  }

  @Put()
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({ summary: 'Save the email settings' })
  async save(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveEmailSettingsDto,
  ): Promise<EmailSettings | null> {
    return toEmailSettings(await this.email.saveSettings(actor, dto));
  }

  @Post('test-connection')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({ summary: 'Open a connection to the mail server. Sends nothing.' })
  testConnection(@CurrentUser() actor: AuthenticatedUser): Promise<ConnectionTestResult> {
    return this.email.testConnection(actor);
  }

  @Post('test-message')
  @RequirePermissions(PERMISSIONS.INTEGRATION_MANAGE)
  @ApiOperation({
    summary: 'Send a test email to your own address',
    description:
      'The recipient is always the signed-in user. A settings screen that emails an ' +
      'arbitrary address on request is an open relay for anyone who can reach it.',
  })
  sendTest(@CurrentUser() actor: AuthenticatedUser): Promise<{ queued: boolean; message: string }> {
    return this.email.sendTest(actor);
  }

  @Get('history')
  @RequirePermissions(PERMISSIONS.INTEGRATION_READ)
  @ApiOperation({
    summary: 'Recent outbound email',
    description: 'Recipient addresses are masked; this is an operational log, not a directory.',
  })
  async history(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MessageHistoryQueryDto,
  ): Promise<PaginatedResponse<OutboundMessageSummary>> {
    const { items, nextCursor, total } = await this.email.history(actor, query);
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
