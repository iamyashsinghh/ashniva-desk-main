import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  ExternalTicketStatus,
  SupportIngressResult,
  WidgetSessionGrant,
} from '@ashniva/types';

import { Public } from '../../common/decorators/public.decorator';
import { RaiseSupportTicketDto } from './dto/support-ingress.dto';
import { MintWidgetSessionDto } from './dto/support-widget.dto';
import { MachineCredentialGuard, type RequestWithProduct } from './machine-credential.guard';
import { SupportIngressService } from './support-ingress.service';
import { SupportWidgetService } from './support-widget.service';

/**
 * The door external products come through.
 *
 * `@Public()` means only that the *employee* guard does not apply; `MachineCredentialGuard` does,
 * and nothing here is reachable without a valid product credential. Marking it public and then
 * guarding it differently is the honest shape: the two kinds of caller are authenticated by two
 * different mechanisms, and pretending otherwise would mean one guard that understands both.
 *
 * Throttled harder than an employee route. A credential that leaks is a credential somebody will
 * use in a loop, and the rate limit is what bounds the damage between the leak and the revocation.
 */
@ApiTags('Support ingress')
@ApiSecurity('product-credential')
@Controller('support')
@Public()
@UseGuards(MachineCredentialGuard)
export class SupportIngressController {
  constructor(
    private readonly ingress: SupportIngressService,
    private readonly widget: SupportWidgetService,
  ) {}

  /**
   * Exchanges the server credential for a browser-safe session.
   *
   * This route is the boundary between the two authentication models. It is reached with `ask_…`,
   * which must never leave the customer's server, and it returns `askp_…`, which is safe to hand
   * to a page because it is bound to one product, one requester and one origin and expires in
   * minutes. Nothing else in the product crosses that line.
   */
  @Post('widget-sessions')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Mint a short-lived, origin-bound support session for one of your users',
    description:
      'Call this from your backend with `Authorization: Bearer ask_<keyId>.<secret>`. Give the ' +
      'returned token to the browser; it expires in minutes and works only on the origin you ' +
      'named, which must be one the product has registered.',
  })
  mintSession(
    @Req() request: RequestWithProduct,
    @Body() dto: MintWidgetSessionDto,
  ): Promise<WidgetSessionGrant> {
    return this.widget.mint(this.productOf(request), dto);
  }

  @Post('tickets')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Raise a support ticket as a registered product',
    description:
      'Authenticate with `Authorization: Bearer ask_<keyId>.<secret>`. Send `Idempotency-Key` ' +
      'to make retries safe: the same key returns the same ticket rather than making another.',
  })
  raise(
    @Req() request: RequestWithProduct,
    @Body() dto: RaiseSupportTicketDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SupportIngressResult> {
    return this.ingress.raise(this.productOf(request), dto, normalizeKey(idempotencyKey));
  }

  @Get('tickets/:id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'The client-safe status of a ticket this product raised',
    description:
      'Returns the status, the priority and public replies. Internal notes, the routing trail ' +
      'and who is assigned are not part of this shape and never will be.',
  })
  status(
    @Req() request: RequestWithProduct,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExternalTicketStatus> {
    return this.ingress.status(this.productOf(request), id);
  }

  /** The guard populates this; a missing product means the guard did not run, which is a bug. */
  private productOf(request: RequestWithProduct) {
    if (!request.product) {
      throw new UnauthorizedException('Present a product credential');
    }
    return request.product;
  }
}

/**
 * An idempotency key is the caller's string, so it is bounded before it becomes a database key.
 * Blank is treated as absent rather than as a key, because an empty header is a caller who did
 * not mean to send one — and one shared empty key across every request would collapse every
 * ticket into the first.
 */
function normalizeKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 200);
}
