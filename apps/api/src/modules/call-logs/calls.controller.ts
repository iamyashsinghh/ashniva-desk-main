import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  PERMISSIONS,
  type AuthenticatedUser,
  type CallAvailability,
  type CallRecordingAccess,
  type CallSummary,
  type PortalCallSummary,
} from '@ashniva/types';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CallRecordingService } from './call-recording.service';
import { CallsService } from './calls.service';
import { InitiateCallDto } from './dto/call.dto';

/**
 * Support calls, over HTTP.
 *
 * Three different gates, on purpose:
 *
 *  * **Starting a call** carries no decorator. Internal staff need `call:initiate`; the person
 *    who raised the ticket needs no permission — a client never holds one — but may only do it on
 *    their own ticket and only where the product allows it. That is an ownership question, so the
 *    service answers it, exactly as ownership is decided everywhere else in this codebase.
 *  * **Reading the internal history** needs `call:read-internal`.
 *  * **Playing a recording** needs `call:play-recording`, which is a different permission from
 *    both of the above and from reading the ticket. It is checked again inside the service
 *    against the product's policy and the caller's place on the project, and every playback and
 *    every refusal is written to the audit log.
 */
@ApiTags('Support calls')
@ApiBearerAuth()
@Controller()
export class CallsController {
  constructor(
    private readonly calls: CallsService,
    private readonly recordings: CallRecordingService,
  ) {}

  @Get('tickets/:id/calls/availability')
  @ApiOperation({ summary: 'Whether a call may be started about this ticket, and why not if not' })
  availability(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallAvailability> {
    return this.calls.availability(actor, id);
  }

  @Post('tickets/:id/calls')
  @HttpCode(201)
  @ApiOperation({ summary: 'Start a support call about this ticket' })
  initiate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InitiateCallDto,
  ): Promise<CallSummary> {
    return this.calls.initiate(actor, id, dto);
  }

  @Get('tickets/:id/calls')
  @RequirePermissions(PERMISSIONS.CALL_READ_INTERNAL)
  @ApiOperation({ summary: 'The internal call history on a ticket' })
  history(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallSummary[]> {
    return this.calls.historyFor(actor, id);
  }

  @Get('portal/tickets/:id/calls')
  @ApiOperation({ summary: 'What a client sees about calls on their own ticket' })
  portalHistory(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PortalCallSummary[]> {
    return this.calls.portalHistoryFor(actor, id);
  }

  @Post('calls/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Call off a support call that has not connected' })
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallSummary> {
    return this.calls.cancel(actor, id);
  }

  /**
   * No decorator, deliberately.
   *
   * `call:play-recording` *is* required — `CallRecordingService` checks it, along with the
   * product's policy and the caller's place on the ticket's project. It is checked there rather
   * than here so that every refusal is written to the audit log with its reason. A guard that
   * rejects first would make the most interesting refusals — somebody without the permission
   * repeatedly asking — the only ones that leave no trace.
   */
  @Get('calls/:id/recording')
  @ApiOperation({ summary: 'A short-lived URL for a call recording (audited every time)' })
  recording(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CallRecordingAccess> {
    return this.recordings.play(actor, id);
  }
}
