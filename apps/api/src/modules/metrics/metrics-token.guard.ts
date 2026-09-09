import { timingSafeEqual } from 'node:crypto';

import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Guards `/metrics` with a shared secret instead of a session.
 *
 * A permission would be the house style, but the caller here is a scraper: Prometheus holds no
 * account, cannot sign in, and cannot refresh a token. A bearer secret from configuration is what
 * such a caller can actually present.
 *
 * When no secret is configured the route answers 404, exactly as it would if it did not exist.
 * "Nobody set a token" means "nobody may read this", never "everybody may" — and 404 rather than
 * 401 so an unconfigured deployment does not advertise that the endpoint is there.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.metrics.token;
    if (!expected) {
      throw new NotFoundException();
    }
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!matches(presented, expected)) {
      // 404 again, not 403: a wrong token learns nothing the right one would not have told it.
      throw new NotFoundException();
    }
    return true;
  }
}

/** Constant-time, and length-safe: `timingSafeEqual` throws on differing lengths. */
function matches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
