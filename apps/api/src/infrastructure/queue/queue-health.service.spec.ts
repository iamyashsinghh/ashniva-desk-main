import { getQueueToken } from '@nestjs/bullmq';
import type { ModuleRef } from '@nestjs/core';
import type { Queue } from 'bullmq';

import { QueueHealthService } from './queue-health.service';
import { QUEUE_NAMES, type QueueName } from './queue-names';
import type { QueueSchedulerRegistrar, SchedulerState } from './scheduled-jobs';

interface FakeQueueOptions {
  counts?: Record<string, number>;
  schedulerIds?: string[];
  schedulersThrow?: boolean;
}

function fakeQueue(name: string, options: FakeQueueOptions = {}): Queue {
  return {
    name,
    getJobCounts: () =>
      Promise.resolve(options.counts ?? { waiting: 0, active: 0, delayed: 0, failed: 0 }),
    getJobSchedulers: () =>
      options.schedulersThrow
        ? Promise.reject(new Error('Redis is not reachable'))
        : Promise.resolve((options.schedulerIds ?? []).map((key) => ({ key, name: key }))),
  } as unknown as Queue;
}

function moduleRefOf(queues: Partial<Record<QueueName, Queue>>): ModuleRef {
  return {
    get: (token: unknown) => {
      const found = Object.entries(queues).find(([name]) => getQueueToken(name) === token);
      if (!found) {
        throw new Error('provider not found');
      }
      return found[1];
    },
  } as unknown as ModuleRef;
}

function registrarOf(states: SchedulerState[]): QueueSchedulerRegistrar {
  return {
    declared: () => states,
    unregistered: () => states.filter((state) => !state.registered),
  } as unknown as QueueSchedulerRegistrar;
}

const running = (queue: QueueName, id: string): SchedulerState => ({
  queue,
  id,
  pattern: '* * * * *',
  registered: true,
  attempts: 1,
});

describe('QueueHealthService', () => {
  it('reports depth for the queues a module registered, and ignores the rest', async () => {
    const service = new QueueHealthService(
      moduleRefOf({
        [QUEUE_NAMES.MESSAGING]: fakeQueue(QUEUE_NAMES.MESSAGING, {
          counts: { waiting: 3, active: 1, delayed: 0, failed: 7 },
        }),
      }),
      registrarOf([]),
    );

    const snapshot = await service.snapshot();

    expect(snapshot.depths).toEqual([
      { queue: QUEUE_NAMES.MESSAGING, waiting: 3, active: 1, delayed: 0, failed: 7 },
    ]);
    expect(snapshot.missing).toEqual([]);
  });

  it('reports a scheduler whose registration failed', async () => {
    const service = new QueueHealthService(
      moduleRefOf({ [QUEUE_NAMES.SLA_MONITOR]: fakeQueue(QUEUE_NAMES.SLA_MONITOR) }),
      registrarOf([
        {
          queue: QUEUE_NAMES.SLA_MONITOR,
          id: 'sla-monitor',
          pattern: '*/2 * * * *',
          registered: false,
          attempts: 3,
          lastError: 'Redis is not reachable',
        },
      ]),
    );

    const { missing } = await service.snapshot();

    expect(missing).toEqual([
      {
        queue: QUEUE_NAMES.SLA_MONITOR,
        id: 'sla-monitor',
        reason: 'registration-failed',
        lastError: 'Redis is not reachable',
      },
    ]);
  });

  it('reports a scheduler that registered at boot and has since vanished from Redis', async () => {
    // Our own record of a successful call is not evidence: a flushed Redis or a mistaken cleanup
    // removes the scheduler, and a process that only remembered startup would claim it was fine.
    const service = new QueueHealthService(
      moduleRefOf({
        [QUEUE_NAMES.NOTIFICATIONS]: fakeQueue(QUEUE_NAMES.NOTIFICATIONS, {
          schedulerIds: ['daily-reminders'],
        }),
      }),
      registrarOf([
        running(QUEUE_NAMES.NOTIFICATIONS, 'deliver-deferred'),
        running(QUEUE_NAMES.NOTIFICATIONS, 'daily-reminders'),
      ]),
    );

    const { missing } = await service.snapshot();

    expect(missing).toEqual([
      { queue: QUEUE_NAMES.NOTIFICATIONS, id: 'deliver-deferred', reason: 'absent-from-redis' },
    ]);
  });

  it('says nothing about schedulers when Redis itself cannot be asked', async () => {
    // The Redis probe already reports that; ten symptoms would bury the one cause.
    const service = new QueueHealthService(
      moduleRefOf({
        [QUEUE_NAMES.BILLING]: fakeQueue(QUEUE_NAMES.BILLING, { schedulersThrow: true }),
      }),
      registrarOf([running(QUEUE_NAMES.BILLING, 'billing-sweep')]),
    );

    const { missing } = await service.snapshot();

    expect(missing).toEqual([]);
  });
});
