import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';

import { AppConfigService } from '../../config/app-config.service';
import { QueueHealthService } from './queue-health.service';
import { QueueShutdownService } from './queue-shutdown.service';
import { QueueSchedulerRegistrar } from './scheduled-jobs';

/**
 * BullMQ connection shared by every queue, plus the three things every queue needs and none of
 * them should implement itself: registering repeatable jobs (and noticing when that fails),
 * reporting depth and scheduler state, and draining workers on shutdown.
 *
 * Feature modules still register their own queues and own their processors (see queue-names.ts).
 * Global because the shutdown service has to be reachable from the data layer, which closes after
 * the workers rather than during them — see QueueShutdownService.
 */
@Global()
@Module({
  imports: [
    DiscoveryModule,
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: { url: config.redis.url },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          // A retention count, not a dead-letter queue: the last 5000 failures stay readable in
          // Redis so an operator can look at them. Nothing consumes them — see the queue section
          // of docs/production-runbook.md for how failures are actually noticed and replayed.
          removeOnFail: 5000,
        },
      }),
    }),
  ],
  providers: [QueueSchedulerRegistrar, QueueHealthService, QueueShutdownService],
  exports: [QueueSchedulerRegistrar, QueueHealthService, QueueShutdownService],
})
export class QueueModule {}
