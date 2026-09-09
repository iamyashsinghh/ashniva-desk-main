import { Injectable } from '@nestjs/common';
import { HEALTH_STATUS, type HealthComponent, type HealthResponse } from '@ashniva/types';
import { PinoLogger } from 'nestjs-pino';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { QueueHealthService } from '../../infrastructure/queue/queue-health.service';
import { RealtimeService } from '../../infrastructure/realtime/realtime.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { API_VERSION } from '../../version';
import { redactMessage } from '../integrations/redact';

@Injectable()
export class HealthService {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly queues: QueueHealthService,
    private readonly realtime: RealtimeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  async check(): Promise<HealthResponse> {
    const [database, redis, storage, queues, realtime] = await Promise.all([
      this.probe('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.probe('redis', () => this.redis.ping()),
      this.probe('storage', () => this.storage.checkBucket()),
      this.probe('queues', () => this.assertSchedulersRunning()),
      this.probe('realtime', () => Promise.resolve(this.describeRealtime())),
    ]);

    const components = { database, redis, storage, queues, realtime };
    const allUp = Object.values(components).every(
      (component) => component.status === HEALTH_STATUS.UP,
    );

    return {
      status: allUp ? HEALTH_STATUS.UP : HEALTH_STATUS.DOWN,
      version: API_VERSION,
      environment: this.config.environment,
      timestamp: new Date().toISOString(),
      components,
    };
  }

  /**
   * Fails readiness when a repeatable job is not running.
   *
   * Queue *depth* deliberately does not fail it: a backlog means the workers are behind, and
   * taking instances out of the load balancer because a queue is deep turns a backlog into an
   * outage. A missing scheduler is the opposite — the work is not late, it is not happening.
   */
  private async assertSchedulersRunning(): Promise<void> {
    const { missing } = await this.queues.snapshot();
    if (missing.length === 0) {
      return;
    }
    const names = missing.map((entry) => `${entry.queue}/${entry.id} (${entry.reason})`).join(', ');
    throw new Error(`Scheduled jobs are not running: ${names}`);
  }

  /**
   * Reports the websocket layer, and refuses only when Socket.IO never attached.
   *
   * A single-instance deployment on the in-process adapter is a correct configuration, so the
   * absence of the shared adapter is stated in the message rather than treated as a failure.
   */
  private describeRealtime(): string {
    const health = this.realtime.health();
    if (!health.attached) {
      throw new Error('Socket.IO is not attached to the HTTP server');
    }
    const fanOut = health.sharedAdapter ? 'shared adapter' : 'in-process adapter (single instance)';
    return `${health.connections} connected, ${fanOut}`;
  }

  /**
   * Runs one component check and reports whether it answered — never why it did not.
   *
   * Readiness is `@Public()`, because a load balancer has no credentials, so whatever this body
   * says is readable by anyone who can reach the deployment. A component's own failure text is
   * the wrong thing to hand them: `password authentication failed for user "ashniva"`,
   * `getaddrinfo ENOTFOUND db.internal…`, `NoSuchBucket: ashniva-desk-prod` — an outage would
   * otherwise publish the database host, the bucket name and the account names. The operator
   * needs the reason, so it goes to the log, where it is already behind whatever guards the logs.
   *
   * An UP component's `message` is a description this code wrote itself (how the realtime layer
   * is fanning out), not something a failure handed us, so it stays.
   */
  private async probe(component: string, action: () => Promise<unknown>): Promise<HealthComponent> {
    const startedAt = Date.now();
    try {
      const detail = await action();
      return {
        status: HEALTH_STATUS.UP,
        latencyMs: Date.now() - startedAt,
        ...(typeof detail === 'string' ? { message: detail } : {}),
      };
    } catch (error) {
      this.logger.error(
        { component, reason: redactMessage(error) },
        `Readiness check failed: ${component}`,
      );
      return { status: HEALTH_STATUS.DOWN, latencyMs: Date.now() - startedAt };
    }
  }
}
