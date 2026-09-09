import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { AppConfigService } from '../../config/app-config.service';

/** Shared ioredis connection for health checks and, later, the Socket.IO adapter and caches. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: AppConfigService) {
    this.client = new Redis(config.redis.url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  async ping(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
    await this.client.ping();
  }

  async onModuleDestroy(): Promise<void> {
    // With lazyConnect, quit() on a client that never connected would open a connection
    // just to close it (and leave the socket open when the offline queue is disabled).
    if (this.client.status === 'wait' || this.client.status === 'end') {
      return;
    }
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
