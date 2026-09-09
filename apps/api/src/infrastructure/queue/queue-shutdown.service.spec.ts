import { WorkerHost } from '@nestjs/bullmq';
import type { DiscoveryService } from '@nestjs/core';
import type { Job, Worker } from 'bullmq';

import { QueueShutdownService } from './queue-shutdown.service';

const silentLogger = { setContext: () => {}, info: () => {}, warn: () => {} } as never;

/** A worker whose graceful close only resolves when the test lets the in-flight job finish. */
class FakeWorker {
  closedGracefully = false;
  closedForcefully = false;
  /** How many times `close()` was called, which is the whole subject of the memoisation case. */
  closeCalls = 0;
  private finishJob?: () => void;

  constructor(private readonly holdsAJob: boolean) {}

  close(force?: boolean): Promise<void> {
    this.closeCalls += 1;
    if (force) {
      this.closedForcefully = true;
      return Promise.resolve();
    }
    if (!this.holdsAJob) {
      this.closedGracefully = true;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.finishJob = () => {
        this.closedGracefully = true;
        resolve();
      };
    });
  }

  /** The in-flight job completes. */
  letJobFinish(): void {
    this.finishJob?.();
  }
}

class FakeProcessor extends WorkerHost {
  constructor(private readonly fake: FakeWorker) {
    super();
  }

  override get worker(): Worker {
    return this.fake as unknown as Worker;
  }

  process(_job: Job): Promise<unknown> {
    return Promise.resolve();
  }
}

/** A processor whose worker was never built — the getter throws, as WorkerHost's does. */
class UnstartedProcessor extends WorkerHost {
  override get worker(): Worker {
    throw new Error('"Worker" has not yet been initialized.');
  }

  process(_job: Job): Promise<unknown> {
    return Promise.resolve();
  }
}

function discoveryOf(instances: readonly unknown[]): DiscoveryService {
  return {
    getProviders: () => instances.map((instance) => ({ instance })),
  } as unknown as DiscoveryService;
}

function serviceFor(instances: readonly unknown[], graceMs: number): QueueShutdownService {
  const config = { queue: { shutdownGraceMs: graceMs } } as never;
  return new QueueShutdownService(discoveryOf(instances), config, silentLogger);
}

describe('QueueShutdownService', () => {
  it('waits for an in-flight job instead of pulling the database out from under it', async () => {
    const worker = new FakeWorker(true);
    const service = serviceFor([new FakeProcessor(worker)], 5_000);

    let drained = false;
    const draining = service.drain().then(() => {
      drained = true;
    });

    // The job is still running, so the drain — and therefore Prisma's disconnect — must not
    // have completed. This is the whole failure: Nest closes workers in onApplicationShutdown,
    // which runs after the onModuleDestroy where the data layer goes away.
    //
    // A real timer tick, not `await Promise.resolve()`: a drain that merely started the close
    // and walked away resolves a microtask or two later, which a microtask check would miss.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(drained).toBe(false);
    expect(worker.closedGracefully).toBe(false);

    worker.letJobFinish();
    await draining;

    expect(drained).toBe(true);
    expect(worker.closedGracefully).toBe(true);
    expect(worker.closedForcefully).toBe(false);
  });

  it('closes a worker with nothing in flight immediately', async () => {
    const worker = new FakeWorker(false);
    const service = serviceFor([new FakeProcessor(worker)], 5_000);

    await service.drain();

    expect(worker.closedGracefully).toBe(true);
    expect(worker.closedForcefully).toBe(false);
  });

  it('stops waiting for a worker that outlasts the grace period, so shutdown is bounded', async () => {
    // BullMQ returns the same in-flight promise for a forced close once a graceful one is under
    // way, so calling close(true) here would await exactly what just timed out and the grace
    // period would bound nothing. Walking away is what makes the bound real.
    const worker = new FakeWorker(true);
    const service = serviceFor([new FakeProcessor(worker)], 20);

    await service.drain();

    expect(worker.closedGracefully).toBe(false);
  });

  it('abandons in-flight jobs immediately when no grace is configured', async () => {
    const worker = new FakeWorker(true);
    const service = serviceFor([new FakeProcessor(worker)], 0);

    await service.drain();

    expect(worker.closedForcefully).toBe(true);
  });

  it('drains every worker, and only once however many callers ask', async () => {
    const first = new FakeWorker(false);
    const second = new FakeWorker(false);
    const service = serviceFor([new FakeProcessor(first), new FakeProcessor(second)], 5_000);

    // PrismaService, StorageService and the service's own hook all call drain(). The memoisation
    // is the entire reason this file exists, so the count is what has to be asserted: checking
    // only that the workers ended up closed passes just as happily with `this.draining ??=`
    // replaced by `return this.closeWorkers()`, which closes each worker three times.
    await Promise.all([service.drain(), service.drain(), service.onModuleDestroy()]);

    expect(first.closeCalls).toBe(1);
    expect(second.closeCalls).toBe(1);
    expect(first.closedGracefully).toBe(true);
    expect(second.closedGracefully).toBe(true);

    // And a caller arriving after the drain finished still gets the same answer, not a new one.
    await service.drain();
    expect(first.closeCalls).toBe(1);
  });

  it('ignores a processor whose worker was never started', async () => {
    const worker = new FakeWorker(false);
    const service = serviceFor([new UnstartedProcessor(), new FakeProcessor(worker)], 5_000);

    await expect(service.drain()).resolves.toBeUndefined();
    expect(worker.closedGracefully).toBe(true);
  });

  it('ignores providers that are not processors', async () => {
    const service = serviceFor([{ notAWorker: true }, undefined], 5_000);
    await expect(service.drain()).resolves.toBeUndefined();
  });
});
