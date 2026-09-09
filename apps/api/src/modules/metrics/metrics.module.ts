import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';
import { MetricsTokenGuard } from './metrics-token.guard';

/**
 * Prometheus-style metrics: HTTP timings, queue depth and failures, connection-pool usage.
 *
 * The middleware is applied in AppModule, where every other global middleware is applied, so this
 * module only owns the registry, the scrape route and its guard.
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsMiddleware, MetricsTokenGuard],
  exports: [MetricsService, MetricsMiddleware],
})
export class MetricsModule {}
