import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import type { QueueName } from './queue-names';

/** One repeatable job a processor wants BullMQ to run on a schedule. */
export interface ScheduledJobSpec {
  /** Scheduler id, and by convention the job name too. */
  id: string;
  /** Cron pattern, in UTC. */
  pattern: string;
  /** Options for each job the scheduler creates (attempts, backoff, retention). */
  jobOptions?: JobsOptions;
}

/** What the registrar knows about one declared scheduler right now. */
export interface SchedulerState {
  queue: QueueName;
  id: string;
  pattern: string;
  registered: boolean;
  attempts: number;
  /** Why the last attempt failed, when it did. */
  lastError?: string;
}

/**
 * How long to wait before trying a failed registration again. The last entry repeats.
 *
 * Fast at first, because the common case is Redis coming up a second after the API; then slow,
 * because after a minute of failures the problem is not a race and hammering Redis while it
 * recovers helps nobody.
 */
const RETRY_DELAYS_MS = [2_000, 10_000, 30_000, 60_000];

/**
 * Registers every processor's repeatable jobs, and remembers whether it worked.
 *
 * Each processor used to do this itself, in a `try`/`catch` that logged a warning and moved on.
 * That is the right call about booting — an API that refuses to start because Redis blinked is
 * worse than one with no schedules — but it was the whole story: nothing retried, and nothing
 * anywhere reported the result. A deployment that came up thirty seconds before Redis had no SLA
 * monitor, no notification delivery, no billing sweep and no daily reports, indefinitely, while
 * every health check said "ready".
 *
 * So this keeps trying, and it keeps the answer where the health probe can read it
 * (`QueueHealthService`). The processors keep owning their own crons; they just stop owning the
 * failure handling, which was identical in all ten of them and wrong in all ten.
 */
@Injectable()
export class QueueSchedulerRegistrar implements OnModuleDestroy {
  private readonly states = new Map<string, SchedulerState>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private stopped = false;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(QueueSchedulerRegistrar.name);
  }

  /**
   * Declares this queue's repeatable jobs and tries to register them.
   *
   * Never throws: a processor calls this from `onModuleInit`, and a Redis that is not up yet must
   * not stop the API from booting. A failed attempt is recorded and retried in the background.
   */
  async register(
    queue: Queue,
    queueName: QueueName,
    jobs: readonly ScheduledJobSpec[],
  ): Promise<void> {
    for (const job of jobs) {
      this.states.set(keyOf(queueName, job.id), {
        queue: queueName,
        id: job.id,
        pattern: job.pattern,
        registered: false,
        attempts: 0,
      });
      await this.attempt(queue, queueName, job);
    }
  }

  /** Every declared scheduler and whether the last attempt to register it succeeded. */
  declared(): SchedulerState[] {
    return [...this.states.values()];
  }

  /** The schedulers that are declared but not registered — the ones that are simply not running. */
  unregistered(): SchedulerState[] {
    return this.declared().filter((state) => !state.registered);
  }

  onModuleDestroy(): void {
    this.stopped = true;
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private async attempt(queue: Queue, queueName: QueueName, job: ScheduledJobSpec): Promise<void> {
    const key = keyOf(queueName, job.id);
    const state = this.states.get(key);
    if (!state || this.stopped) {
      return;
    }
    state.attempts += 1;
    try {
      await queue.upsertJobScheduler(
        job.id,
        { pattern: job.pattern },
        { name: job.id, ...(job.jobOptions ? { opts: job.jobOptions } : {}) },
      );
      state.registered = true;
      delete state.lastError;
      if (state.attempts > 1) {
        this.logger.info({ queue: queueName, job: job.id }, 'Scheduled job registered on retry');
      }
    } catch (error) {
      state.registered = false;
      state.lastError = error instanceof Error ? error.message : String(error);
      const delay = RETRY_DELAYS_MS[Math.min(state.attempts - 1, RETRY_DELAYS_MS.length - 1)];
      this.logger.warn(
        { queue: queueName, job: job.id, attempts: state.attempts, retryInMs: delay },
        'Could not register a scheduled job; it is not running and will be retried',
      );
      this.scheduleRetry(queue, queueName, job, delay ?? 60_000);
    }
  }

  private scheduleRetry(
    queue: Queue,
    queueName: QueueName,
    job: ScheduledJobSpec,
    delayMs: number,
  ): void {
    if (this.stopped) {
      return;
    }
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void this.attempt(queue, queueName, job);
    }, delayMs);
    // Unreferenced so a pending retry never holds the process — or a test runner — open.
    timer.unref();
    this.timers.add(timer);
  }
}

function keyOf(queueName: QueueName, jobId: string): string {
  return `${queueName}:${jobId}`;
}
