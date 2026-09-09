import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { IvrWebhookService } from './ivr-webhook.service';

/**
 * Inbound IVR deliveries.
 *
 * Public by necessity — a telephony provider has no session — so the signature is the whole of
 * the authentication, and the tenant is resolved from a server-side mapping *before* anything is
 * written. An anonymous caller who invents an account id, a call id or an organization id is
 * turned away with nothing recorded.
 *
 * `rawBody` is required: the HMAC covers the exact bytes the provider sent, and re-serialising a
 * parsed body reorders keys and changes whitespace, which would fail every genuine delivery.
 */
@ApiTags('Webhooks')
@Controller('webhooks/ivr')
export class IvrWebhooksController {
  constructor(private readonly webhooks: IvrWebhookService) {}

  @Post(':provider')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'IVR webhook (X-IVR-Signature verified over the raw body)' })
  @ApiExcludeEndpoint()
  async receive(
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ status: string }> {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');
    const outcome = await this.webhooks.handle(provider, rawBody, request.headers, request.body);

    if (outcome.status === 'rejected') {
      // Deliberately without a reason: telling a caller whether the account was unknown, the
      // signature wrong or the call id unrecognised tells them which of the three to work on.
      throw new UnauthorizedException('Webhook rejected');
    }
    // 200 for anything genuinely delivered, including a redelivery, so the provider stops
    // retrying something Desk has already dealt with.
    return { status: outcome.status };
  }
}
