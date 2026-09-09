import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Logger } from 'nestjs-pino';
import type { Server, ServerOptions } from 'socket.io';

import { AppConfigService } from '../../config/app-config.service';
import { realtimeChannelKey } from './realtime-channel-key';

/**
 * Socket.IO across more than one API instance, and the one place websocket CORS is decided.
 *
 * Without a shared adapter every `server.to(room).emit(…)` reaches only the sockets connected to
 * the instance that ran it. Two instances behind a load balancer therefore split every audience in
 * half at random: a notification badge appears for the people who happened to land on the emitting
 * pod, an internal chat message reaches some of its recipients, and an entity-changed event
 * refreshes some browsers. Nothing errors, which is what makes it hard to notice — it looks like
 * flakiness rather than a missing component.
 *
 * The Redis adapter fans each emit out over pub/sub so every instance delivers to its own sockets.
 *
 * Degrading gracefully: the two clients keep ioredis's own reconnection and buffer commands while
 * they are down, so a Redis blip costs cross-instance delivery for its duration and nothing else —
 * sockets stay connected, local emits still arrive, and the adapter resumes on reconnect. A Redis
 * that is down at boot is not a reason to refuse to start, for the same reason.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly config: AppConfigService;
  private readonly logger: Logger;
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(app: INestApplicationContext) {
    super(app);
    this.config = app.get(AppConfigService);
    this.logger = app.get(Logger);
  }

  /** Opens the pub/sub pair. Returns even when Redis is unreachable; ioredis keeps retrying. */
  connect(): void {
    const url = this.config.redis.url;
    // maxRetriesPerRequest must be null for a connection the adapter subscribes on: the default
    // makes ioredis reject buffered commands after a few attempts, which would turn a short
    // outage into a permanently dead subscription.
    this.pubClient = new Redis(url, { maxRetriesPerRequest: null });
    this.subClient = this.pubClient.duplicate();
    for (const [role, client] of [
      ['pub', this.pubClient],
      ['sub', this.subClient],
    ] as const) {
      // Without a listener, ioredis's connection errors reach the process as unhandled 'error'
      // events and take the API down — over a dependency the design already tolerates losing.
      client.on('error', (error: Error) => {
        this.logger.warn(
          `Realtime Redis ${role} connection error: ${error.message}. Cross-instance delivery is paused.`,
        );
      });
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      // Decided here rather than on each `@WebSocketGateway`, so the websocket layer honours the
      // same CORS_ORIGINS list the HTTP layer does. Both gateways share this one server, so the
      // decorator's value was whichever gateway Nest happened to instantiate first anyway.
      cors: { origin: this.config.cors.origins, credentials: true },
    }) as Server;

    if (this.pubClient && this.subClient) {
      // A deployment-specific channel prefix, not the library default. Two stacks sharing one
      // Redis otherwise subscribe to the same channels and cross-deliver each other's events —
      // silently, because Redis cannot tell who published what. See `realtimeChannelKey`.
      server.adapter(
        createAdapter(this.pubClient, this.subClient, {
          key: realtimeChannelKey(this.config.app.webUrl),
        }),
      );
    }
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    for (const client of [this.pubClient, this.subClient]) {
      await client?.quit().catch(() => client.disconnect());
    }
    this.pubClient = undefined;
    this.subClient = undefined;
  }
}
