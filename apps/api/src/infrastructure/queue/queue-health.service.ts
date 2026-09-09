import { getQueueToken } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';

import { QUEUE_NAMES, type QueueName } from './queue-names';
import { QueueSchedulerRegistrar, type SchedulerState } from './scheduled-jobs';

/** Job counts for one queue, as BullMQ reports them. */
export interface QueueDepth {
  queue: QueueName;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

/** A scheduler that should be running but is not, and why we think so. */
export interface MissingScheduler {
  queue: QueueName;
  id: string;
  reason: 'registration-failed' | 'absent-from-redis';
  lastError?: string;
}

export interface QueueSnapshot {
  depths: QueueDepth[];
  schedulers: SchedulerState[];
  missing: MissingScheduler[];
}

/**
 * What the background work is actually doing, for the readiness probe and the metrics endpoint.
 *
 * Two questions, and the second is the one that was unanswerable before: how much work is queued,
 * and are the scheduled jobs running at all. A deployment can be perfectly healthy by every other
 * measure — database up, Redis up, storage up — with no SLA monitor, no notification delivery and
 * no billing sweep, because registering them failed once at boot. That is a readiness failure, so
 * `HealthService` treats a missing scheduler as one.
 *
 * Depth is reported but never fails the probe. A backlog means the workers are behind, not that
 * this instance should be taken out of the load balancer — and pulling instances out of rotation
 * because a queue is deep is how a backlog becomes an outage.
 */
@Injectable()
export class QueueHealthService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly schedulers: QueueSchedulerRegistrar,
  ) {}

  async snapshot(): Promise<QueueSnapshot> {
    const queues = this.registeredQueues();
    const depths = await Promise.all([...queues].map(([name, queue]) => this.depthOf(name, queue)));
    const declared = this.schedulers.declared();
    const missing = await this.missingSchedulers(queues, declared);
    return { depths, schedulers: declared, missing };
  }

  private async depthOf(queue: QueueName, instance: Queue): Promise<QueueDepth> {
    const counts = await instance.getJobCounts('waiting', 'active', 'delayed', 'failed');
    return {
      queue,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  /**
   * Redis is the authority, not our own record of having registered something.
   *
   * A scheduler registered at boot can disappear afterwards — a flushed Redis, a botched cleanup,
   * an operator removing the wrong key — and a service that only remembered its own successful
   * call at startup would go on claiming everything was fine for as long as the process lived.
   */
  private async missingSchedulers(
    queues: Map<QueueName, Queue>,
    declared: readonly SchedulerState[],
  ): Promise<MissingScheduler[]> {
    const missing: MissingScheduler[] = [];
    const liveIds = new Map<QueueName, Set<string> | undefined>();

    for (const state of declared) {
      if (!state.registered) {
        missing.push({
          queue: state.queue,
          id: state.id,
          reason: 'registration-failed',
          ...(state.lastError ? { lastError: state.lastError } : {}),
        });
        continue;
      }
      const queue = queues.get(state.queue);
      if (!queue) {
        continue;
      }
      if (!liveIds.has(state.queue)) {
        liveIds.set(state.queue, await this.schedulerIds(queue));
      }
      const ids = liveIds.get(state.queue);
      if (ids && !ids.has(state.id)) {
        missing.push({ queue: state.queue, id: state.id, reason: 'absent-from-redis' });
      }
    }
    return missing;
  }

  /** The scheduler ids Redis holds for this queue, or `undefined` when Redis could not be asked. */
  private async schedulerIds(queue: Queue): Promise<Set<string> | undefined> {
    try {
      const schedulers = await queue.getJobSchedulers();
      return new Set(schedulers.map((scheduler) => scheduler.key));
    } catch {
      // Redis being unreachable is already the Redis probe's finding. Reporting every scheduler as
      // missing on top of it would bury the one real cause under ten symptoms, so say nothing.
      return undefined;
    }
  }

  /** The queues some module actually registered; the rest of QUEUE_NAMES has no provider. */
  private registeredQueues(): Map<QueueName, Queue> {
    const queues = new Map<QueueName, Queue>();
    for (const name of Object.values(QUEUE_NAMES)) {
      try {
        queues.set(name, this.moduleRef.get<Queue>(getQueueToken(name), { strict: false }));
      } catch {
        // A name in QUEUE_NAMES that no module registered. Not an error: the constant is the
        // catalogue, and a queue exists only once a module asks for it.
      }
    }
    return queues;
  }
}
