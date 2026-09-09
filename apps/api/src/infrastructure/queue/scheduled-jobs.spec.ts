import type { Queue } from 'bullmq';

import { QUEUE_NAMES } from './queue-names';
import { QueueSchedulerRegistrar } from './scheduled-jobs';

const silentLogger = {
  setContext: () => {},
  info: () => {},
  warn: () => {},
} as never;

function fakeQueue(behaviour: { failuresBeforeSuccess?: number } = {}): {
  queue: Queue;
  calls: string[];
} {
  const calls: string[] = [];
  let remainingFailures = behaviour.failuresBeforeSuccess ?? 0;
  const queue = {
    upsertJobScheduler: (id: string): Promise<void> => {
      calls.push(id);
      if (remainingFailures > 0) {
        remainingFailures -= 1;
        return Promise.reject(new Error('Redis is not reachable'));
      }
      return Promise.resolve();
    },
  } as unknown as Queue;
  return { queue, calls };
}

describe('QueueSchedulerRegistrar', () => {
  it('registers each declared job and reports it as running', async () => {
    const registrar = new QueueSchedulerRegistrar(silentLogger);
    const { queue, calls } = fakeQueue();

    await registrar.register(queue, QUEUE_NAMES.NOTIFICATIONS, [
      { id: 'deliver-deferred', pattern: '* * * * *' },
      { id: 'daily-reminders', pattern: '0 3 * * *' },
    ]);

    expect(calls).toEqual(['deliver-deferred', 'daily-reminders']);
    expect(registrar.unregistered()).toEqual([]);
    expect(registrar.declared()).toHaveLength(2);
    registrar.onModuleDestroy();
  });

  it('does not throw when Redis is down, so the API still boots', async () => {
    const registrar = new QueueSchedulerRegistrar(silentLogger);
    const { queue } = fakeQueue({ failuresBeforeSuccess: 1 });

    await expect(
      registrar.register(queue, QUEUE_NAMES.BILLING, [
        { id: 'billing-sweep', pattern: '30 1 * *' },
      ]),
    ).resolves.toBeUndefined();
    registrar.onModuleDestroy();
  });

  it('remembers that a failed job is not running, and why', async () => {
    // The failure this replaces logged a warning and was then unknowable: the app ran with no
    // schedules and every health check said it was ready.
    const registrar = new QueueSchedulerRegistrar(silentLogger);
    const { queue } = fakeQueue({ failuresBeforeSuccess: 1 });

    await registrar.register(queue, QUEUE_NAMES.SLA_MONITOR, [
      { id: 'sla-monitor', pattern: '*/2 * * * *' },
    ]);

    const unregistered = registrar.unregistered();
    expect(unregistered).toHaveLength(1);
    expect(unregistered[0]).toMatchObject({
      queue: QUEUE_NAMES.SLA_MONITOR,
      id: 'sla-monitor',
      registered: false,
    });
    expect(unregistered[0]?.lastError).toMatch(/Redis is not reachable/);
    registrar.onModuleDestroy();
  });

  it('retries a failed registration and clears the failure once it lands', async () => {
    jest.useFakeTimers();
    try {
      const registrar = new QueueSchedulerRegistrar(silentLogger);
      const { queue, calls } = fakeQueue({ failuresBeforeSuccess: 1 });

      await registrar.register(queue, QUEUE_NAMES.CONTRACTS, [
        { id: 'contract-daily', pattern: '0 19 * * *' },
      ]);
      expect(registrar.unregistered()).toHaveLength(1);

      // The first retry is two seconds away.
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();

      expect(calls).toEqual(['contract-daily', 'contract-daily']);
      expect(registrar.unregistered()).toEqual([]);
      registrar.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('stops retrying once the module is destroyed', async () => {
    jest.useFakeTimers();
    try {
      const registrar = new QueueSchedulerRegistrar(silentLogger);
      const { queue, calls } = fakeQueue({ failuresBeforeSuccess: 5 });

      await registrar.register(queue, QUEUE_NAMES.MESSAGING, [
        { id: 'stalled-send-sweep', pattern: '*/5 * * * *' },
      ]);
      registrar.onModuleDestroy();

      jest.advanceTimersByTime(120_000);
      await Promise.resolve();

      expect(calls).toEqual(['stalled-send-sweep']);
    } finally {
      jest.useRealTimers();
    }
  });
});
