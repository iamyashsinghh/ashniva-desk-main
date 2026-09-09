import { Controller, Get, Header, UseGuards, Version, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { MetricsTokenGuard } from './metrics-token.guard';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint.
 *
 * `@Public()` only means "no JWT": `MetricsTokenGuard` still requires the configured scrape
 * secret, and answers 404 without it. Version-neutral because a scrape configuration outlives an
 * API version, and excluded from the API documentation because it is not part of the product's
 * surface.
 */
@ApiExcludeController()
@Controller('metrics')
@UseGuards(MetricsTokenGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @Version(VERSION_NEUTRAL)
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): Promise<string> {
    return this.metrics.render();
  }
}
