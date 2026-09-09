import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { headerValue } from '../../common/crypto/webhook-signature';
import { WhatsAppService } from './whatsapp.service';

/**
 * Inbound WhatsApp webhooks.
 *
 * Public by necessity — Meta has no session — so the signature is the only authentication, and
 * the tenant is resolved from the business account id in the payload *before* anything is
 * written. An anonymous caller who invents an id is turned away with nothing recorded.
 *
 * `rawBody` is required: the HMAC covers the exact bytes Meta sent, and re-serialising a parsed
 * body reorders keys and changes whitespace, which would fail every genuine delivery.
 */
@ApiTags('Webhooks')
@Controller('webhooks/whatsapp')
export class WhatsAppWebhooksController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  /**
   * Meta's subscription handshake.
   *
   * `hub.verify_token` is compared in constant time against the token stored for the business
   * account named in the query. Anything else gets 403 without a hint at which part was wrong.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Meta subscription verification handshake' })
  @ApiExcludeEndpoint()
  async verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Query('waba') businessAccountId: string | undefined,
  ): Promise<string> {
    if (mode !== 'subscribe') {
      throw new ForbiddenException('Verification failed');
    }
    const echo = await this.whatsapp.verifySubscription(businessAccountId, token, challenge);
    if (echo === null) {
      throw new ForbiddenException('Verification failed');
    }
    // Meta expects the challenge back as a bare string, not JSON.
    return echo;
  }

  @Post()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp webhook (X-Hub-Signature-256 verified over the raw body)' })
  @ApiExcludeEndpoint()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: unknown,
  ): Promise<{ status: string }> {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    const signature = headerValue(request.headers, 'x-hub-signature-256');
    const outcome = await this.whatsapp.handleWebhook(rawBody, signature, body);

    if (outcome.status === 'rejected') {
      // Deliberately without a reason: telling a caller whether the business account was unknown
      // or the signature was wrong tells them which of the two to work on next.
      throw new UnauthorizedException('Webhook rejected');
    }
    // 200 for anything genuinely delivered, including a redelivery, so Meta stops retrying.
    return { status: outcome.status };
  }
}
