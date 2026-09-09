import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

import { PrismaService } from '../../database/prisma.service';
import {
  QueueHealthService,
  type QueueSnapshot,
} from '../../infrastructure/queue/queue-health.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';

const PREFIX = 'ashniva_';

/**
 * Request durations, in seconds.
 *
 * Buckets chosen for this API rather than taken from a library default: most endpoints answer in
 * tens of milliseconds, the report and dashboard queries in hundreds, and anything past two
 * seconds is the interesting tail. Buckets that all sit below the slow requests would make every
 * slow endpoint look identical.
 */
const DURATION_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

/**
 * The numbers a Prometheus scraper reads from `/metrics`.
 *
 * Three things nobody could see before: how the HTTP surface is behaving, whether the background
 * work is keeping up, and whether the connection pool is the reason a request is slow. Queue
 * depth and pool usage are gauges collected at scrape time — asking Redis and reading the pool's
 * counters is cheap, and a gauge that is only updated when something happens goes stale exactly
 * when it matters.
 *
 * Nothing here is labelled with a user, an organization or a path parameter. Cardinality is a
 * cost that lands on the monitoring system rather than on us, so route labels are the *pattern*
 * (`/api/v1/tickets/:id`), never the resolved URL.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  readonly registry = new Registry();

  private readonly httpDuration: Histogram<'method' | 'route' | 'status'>;
  private readonly httpErrors: Counter<'method' | 'route' | 'status'>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueHealthService,
    private readonly realtime: RealtimeService,
  ) {
    this.registry.setDefaultLabels({ service: 'ashniva-api' });

    this.httpDuration = new Histogram({
      name: `${PREFIX}http_request_duration_seconds`,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: DURATION_BUCKETS,
      registers: [this.registry],
    });

    this.httpErrors = new Counter({
      name: `${PREFIX}http_errors_total`,
      help: 'HTTP responses with a 5xx status',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry, prefix: PREFIX });
    this.registerQueueGauges();
    this.registerDatabaseGauges();
    this.registerRealtimeGauges();
  }

  /**
   * Lets the application be collected once it is closed.
   *
   * `collectDefaultMetrics` installs a `PerformanceObserver` for garbage-collection timings and
   * never disconnects it. An observer is registered with the Node runtime, so it is a root that
   * outlives the application: its callback holds the gc histogram, the histogram holds this
   * registry, the registry holds the queue, pool and realtime gauges, and each of those gauges'
   * `collect` closures holds this service — and therefore PrismaService, QueueHealthService and
   * the rest of the graph. One closed application stayed alive forever, and every new one added
   * another.
   *
   * It has no consequence for a server, which builds one application and keeps it. It has a large
   * one for tests, which build ~50 across a run: measured at ~57 MB retained per application,
   * which is what walked the e2e suite into a 2 GB heap. Emptying the registry cuts the chain at
   * its first link — the observer stays, holding one empty registry and nothing else.
   *
   * prom-client exposes no way to disconnect the observer, which is why this is the seam.
   */
  onModuleDestroy(): void {
    this.registry.clear();
  }

  /** Called by the metrics middleware once a response has been written. */
  observeRequest(method: string, route: string, status: number, durationSeconds: number): void {
    const labels = { method, route, status: String(status) };
    this.httpDuration.observe(labels, durationSeconds);
    if (status >= 500) {
      this.httpErrors.inc(labels);
    }
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  private registerQueueGauges(): void {
    // Both gauges want the same snapshot and prom-client collects each metric separately, so a
    // scrape would otherwise ask Redis for every queue's counts twice. The window only has to
    // cover one scrape; anything longer would report stale depths.
    const cacheMs = 2_000;
    let cached: { at: number; snapshot: Promise<QueueSnapshot> } | undefined;
    const collectSnapshot = (): Promise<QueueSnapshot> => {
      const now = Date.now();
      if (!cached || now - cached.at > cacheMs) {
        cached = { at: now, snapshot: this.queues.snapshot() };
      }
      return cached.snapshot;
    };

    new Gauge({
      name: `${PREFIX}queue_jobs`,
      help: 'Jobs on a queue, by state',
      labelNames: ['queue', 'state'],
      registers: [this.registry],
      collect: async function (this: Gauge<'queue' | 'state'>): Promise<void> {
        const snapshot = await collectSnapshot();
        this.reset();
        for (const entry of snapshot.depths) {
          this.set({ queue: entry.queue, state: 'waiting' }, entry.waiting);
          this.set({ queue: entry.queue, state: 'active' }, entry.active);
          this.set({ queue: entry.queue, state: 'delayed' }, entry.delayed);
          this.set({ queue: entry.queue, state: 'failed' }, entry.failed);
        }
      },
    });
    new Gauge({
      name: `${PREFIX}queue_schedulers_missing`,
      help: 'Repeatable jobs that are declared but not running (0 is healthy)',
      registers: [this.registry],
      collect: async function (this: Gauge): Promise<void> {
        this.set((await collectSnapshot()).missing.length);
      },
    });
  }

  private registerDatabaseGauges(): void {
    const connections = new Gauge({
      name: `${PREFIX}db_pool_connections`,
      help: 'pg pool connections, by state',
      labelNames: ['state'],
      registers: [this.registry],
      collect: (): void => {
        const pool = this.prisma.pool;
        connections.set({ state: 'total' }, pool.totalCount);
        connections.set({ state: 'idle' }, pool.idleCount);
        // Callers queued for a connection. Sustained above zero means DB_POOL_MAX is the
        // bottleneck, and every one of those callers is paying for it in request latency.
        connections.set({ state: 'waiting' }, pool.waitingCount);
      },
    });
  }

  private registerRealtimeGauges(): void {
    const sockets = new Gauge({
      name: `${PREFIX}realtime_connections`,
      help: 'Sockets connected to this instance',
      registers: [this.registry],
      collect: (): void => {
        sockets.set(this.realtime.health().connections);
      },
    });
  }
}
