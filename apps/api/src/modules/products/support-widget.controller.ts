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
  WidgetCapabilities,
} from '@ashniva/types';

import { Public } from '../../common/decorators/public.decorator';
import { RaiseWidgetTicketDto } from './dto/support-widget.dto';
import type { AuthenticatedWidget } from './product-context';
import { SupportIngressService } from './support-ingress.service';
import { SupportWidgetService } from './support-widget.service';
import { WidgetSessionGuard, type RequestWithWidget } from './widget-session.guard';

/**
 * The door a browser comes through.
 *
 * `@Public()` means only that the *employee* guard does not apply; `WidgetSessionGuard` does, and
 * nothing here is reachable without a valid, unexpired, origin-matched session token.
 *
 * Throttled harder than the server ingress. These routes are reachable from a page anybody can
 * load, so the rate limit is what stands between a leaked token and a queue full of junk for the
 * fifteen minutes before it expires.
 */
@ApiTags('Support widget')
@ApiSecurity('widget-session')
@Controller('support/widget')
@Public()
@UseGuards(WidgetSessionGuard)
export class SupportWidgetController {
  constructor(
    private readonly ingress: SupportIngressService,
    private readonly widget: SupportWidgetService,
  ) {}

  @Get('config')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'What this product’s support currently offers' })
  config(@Req() request: RequestWithWidget): Promise<WidgetCapabilities> {
    return this.widget.capabilitiesFor(this.widgetOf(request));
  }

  @Post('tickets')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Raise a ticket as the person this session was minted for',
    description:
      'The requester comes from the session token, never from the body. Send `Idempotency-Key` ' +
      'to make retries safe: the same key returns the same ticket rather than making another. ' +
      'A key is scoped to the session’s user, so two of your users may pick the same one.',
  })
  raise(
    @Req() request: RequestWithWidget,
    @Body() dto: RaiseWidgetTicketDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<SupportIngressResult> {
    const widget = this.widgetOf(request);
    return this.ingress.raise(
      widget.product,
      // The identity is stitched in here, from the token. There is no path by which a value from
      // the request body can reach these four fields.
      { ...dto, externalUserId: widget.externalUserId },
      scopeKey(widget.externalUserId, normalizeKey(idempotencyKey)),
    );
  }

  @Get('tickets/:id')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'The client-safe status of a ticket this session’s product raised',
    description:
      'Returns the status, the priority and public replies. Internal notes, the routing trail ' +
      'and who is assigned are not part of this shape and never will be.',
  })
  status(
    @Req() request: RequestWithWidget,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ExternalTicketStatus> {
    const widget = this.widgetOf(request);
    // The requester travels with the read, not only with the write. The token is minted for one
    // end user; without pinning the read to them, one of a product's users could read another's
    // ticket — title, priority, external reference and every public reply — by guessing its id.
    return this.ingress.status(widget.product, id, widget.externalUserId);
  }

  /** The guard populates this; a missing session means the guard did not run, which is a bug. */
  private widgetOf(request: RequestWithWidget): AuthenticatedWidget {
    if (!request.widget) {
      throw new UnauthorizedException('Present a support session token');
    }
    return request.widget;
  }
}

/** Bounded before it becomes a database key, exactly as on the server ingress. */
function normalizeKey(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}

/**
 * The key a browser sends, namespaced by the person the session was minted for.
 *
 * The stored key is unique per product, and on the widget path the whole key is chosen by the
 * browser. Integrators pick meaningful keys — `carelix-support-<userId>-<n>` is exactly the shape
 * the SDK's own documentation suggests — so one of a product's users can guess another's, POST any
 * body, and be handed back that other person's ticket id as a "duplicate". Prefixing with the
 * session's requester makes a key mean "this user's attempt number n" rather than "the product's",
 * which is what an end user could ever have meant by it. The server ingress is untouched: a
 * machine credential speaks for the product, so its keys stay product-wide.
 *
 * The length prefix is what makes that namespace a namespace rather than a suggestion. A bare
 * `user:key` join is ambiguous as soon as the identifier may contain the delimiter itself — and
 * it may: `externalUserId` is whatever the customer's backend calls that person, and `auth0:1234`
 * is an ordinary shape for one. Without the prefix, user `acme` with key `tickets:7` and user
 * `acme:tickets` with key `7` build the same stored value under
 * `UNIQUE (product_id, idempotency_key)`, and the second caller is handed the first's ticket id
 * as `duplicate: true` — the cross-user read this scoping exists to prevent, reached from the
 * other side. With the count in front, the namespace is exactly the number of characters it
 * claims, so one stored value can come from only one (identifier, key) pair. Escaping the
 * delimiter would work as well; a count needs no reader and cannot be half-applied.
 */
export function scopeKey(externalUserId: string, key: string | undefined): string | undefined {
  return key ? `${externalUserId.length}:${externalUserId}:${key}` : undefined;
}
