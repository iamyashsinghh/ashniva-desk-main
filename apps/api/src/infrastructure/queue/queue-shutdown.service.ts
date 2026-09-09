import { WorkerHost } from '@nestjs/bullmq';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { Worker } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Stops the queue workers before the things they depend on go away.
 *
 * `@nestjs/bullmq` does close its workers, but in `onApplicationShutdown` — which Nest runs
 * *after* `onModuleDestroy`, where Prisma disconnects and the S3 client is destroyed. So on
 * SIGTERM the order was: pull the database out from under the workers, then ask them politely to
 * finish. A job halfway through a billing sweep or an outbound send failed on a closed connection
 * and, depending on where it was, either retried work it had already done or lost it.
 *
 * The fix has to be an explicit dependency rather than a lifecycle hook of its own, because Nest
 * runs every provider's `onModuleDestroy` concurrently: ordering can only come from one of them
 * awaiting the other. PrismaService and StorageService therefore await `drain()` first. It is
 * memoised, so whichever of them (or this service's own hook) gets there first does the work and
 * the rest wait on the same promise.
 */
@Injectable()
export class QueueShutdownService implements OnModuleDestroy {
  private draining?: Promise<void>;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly config: AppConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QueueShutdownService.name);
  }

  onModuleDestroy(): Promise<void> {
    return this.drain();
  }

  /** Closes every worker, giving in-flight jobs a bounded time to finish. Runs once. */
  drain(): Promise<void> {
    this.draining ??= this.closeWorkers();
    return this.draining;
  }

  private async closeWorkers(): Promise<void> {
    const workers = this.workers();
    if (workers.length === 0) {
      return;
    }

    const graceMs = this.config.queue.shutdownGraceMs;
    this.logger.info({ workers: workers.length, graceMs }, 'Draining queue workers');

    const results = await Promise.all(workers.map((worker) => this.close(worker, graceMs)));
    const forced = results.filter((outcome) => outcome === 'forced').length;
    if (forced > 0) {
      // Worth saying plainly: these jobs were interrupted, and BullMQ will hand them to another
      // instance as stalled. Whether that is safe is the job's business, not ours.
      this.logger.warn({ forced }, 'Some queue workers did not finish within the grace period');
    } else {
      this.logger.info('Queue workers drained');
    }
  }

  private close(worker: Worker, graceMs: number): Promise<'drained' | 'forced'> {
    if (graceMs === 0) {
      // No grace asked for: abandon the in-flight jobs immediately.
      return worker.close(true).then(
        () => 'forced' as const,
        () => 'forced' as const,
      );
    }
    // `close()` stops fetching new jobs at once and resolves when the active ones finish, so the
    // race is only about how long we are willing to wait for them.
    //
    // On timeout we stop waiting rather than calling `close(true)`. BullMQ returns the *same*
    // in-flight promise for a forced close once a graceful one is under way, so "forcing" after
    // the fact would await exactly the thing that just timed out — the grace period would bound
    // nothing and the process would hang until the orchestrator killed it. Walking away is what
    // makes the bound real: the jobs still running are left, and another instance picks them up
    // as stalled, which is the outcome the grace period was rationing in the first place.
    //
    // Be clear about what "left" costs, because this is the one path that reintroduces the
    // failure the whole service exists to prevent: walking away lets `drain()` resolve, so
    // PrismaService disconnects and the S3 client is destroyed while that job is still running.
    // It meets a closed connection mid-write — exactly the state a graceful drain avoids, now
    // confined to jobs that outlasted `QUEUE_SHUTDOWN_GRACE_MS` instead of every job in flight.
    // The grace period is the dial: set it above the slowest job that must not be interrupted,
    // and below the orchestrator's kill grace period.
    const graceful = worker.close().then(
      () => 'drained' as const,
      () => 'drained' as const,
    );
    return Promise.race([graceful, delay(graceMs).then(() => 'forced' as const)]);
  }

  /** Every `@Processor` in the application, via the worker `@nestjs/bullmq` built for it. */
  private workers(): Worker[] {
    const workers: Worker[] = [];
    for (const wrapper of this.discovery.getProviders()) {
      const instance: unknown = wrapper.instance;
      if (!(instance instanceof WorkerHost)) {
        continue;
      }
      try {
        workers.push(instance.worker);
      } catch {
        // The getter throws when the explorer never built a worker for this host (a processor
        // registered but never started). There is nothing to close, which is the outcome we want.
      }
    }
    return workers;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}
