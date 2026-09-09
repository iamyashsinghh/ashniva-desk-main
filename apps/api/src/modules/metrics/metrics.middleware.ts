import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { routePattern } from '../../common/http/route-pattern';
import { MetricsService } from './metrics.service';

/**
 * Times every request, including the ones no controller ever sees.
 *
 * A middleware rather than an interceptor on purpose: interceptors run after the guards, so a
 * request rejected by the throttler or the JWT guard — precisely the requests worth watching
 * during an incident — would never be counted. `res.on('finish')` fires for all of them.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.observeRequest(
        request.method,
        routePattern(request),
        response.statusCode,
        seconds,
      );
    });
    next();
  }
}
