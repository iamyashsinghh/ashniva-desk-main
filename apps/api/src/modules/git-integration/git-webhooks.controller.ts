import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { GitService } from './git.service';

/**
 * Inbound Git webhooks.
 *
 * Public by necessity — a provider has no session — so the signature is the only authentication.
 * The rule the rest of the design leans on: nothing is written and nothing is parsed until the
 * signature has been verified against the tenant's own secret, and an unverified request is
 * answered without saying why.
 *
 * `rawBody` is required: the HMAC covers the exact bytes the provider sent, and re-serialising a
 * parsed body reorders keys and changes whitespace, which would fail every genuine delivery.
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class GitWebhooksController {
  constructor(private readonly git: GitService) {}

  @Post('github')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'GitHub webhook (X-Hub-Signature-256 verified over the raw body)' })
  @ApiExcludeEndpoint()
  github(@Req() request: RawBodyRequest<Request>, @Body() body: unknown) {
    return this.receive('GITHUB', request, body);
  }

  @Post('gitlab')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'GitLab webhook (X-Gitlab-Token compared in constant time)' })
  @ApiExcludeEndpoint()
  gitlab(@Req() request: RawBodyRequest<Request>, @Body() body: unknown) {
    return this.receive('GITLAB', request, body);
  }

  private async receive(
    provider: 'GITHUB' | 'GITLAB',
    request: RawBodyRequest<Request>,
    body: unknown,
  ): Promise<{ status: string }> {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(body ?? {}), 'utf8');
    const outcome = await this.git.handleWebhook(
      provider,
      { rawBody, headers: request.headers },
      body,
    );

    // 202 for everything that was genuinely delivered, so the provider does not retry a duplicate.
    // A rejected signature is the one case that answers 401 — with no detail about what failed.
    if (outcome.status === 'rejected') {
      // Thrown rather than returned so the global filter shapes it like every other error, and
      // deliberately without a reason: telling a caller whether the repository was unknown or the
      // signature was wrong would help them work out which of the two to fix.
      throw new UnauthorizedException('Webhook rejected');
    }
    return { status: outcome.status };
  }
}
