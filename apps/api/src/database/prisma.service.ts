import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { TenantContextService } from '../common/tenant/tenant-context.service';
import { AppConfigService } from '../config/app-config.service';
import { PrismaClient } from '../generated/prisma/client';
import { QueueShutdownService } from '../infrastructure/queue/queue-shutdown.service';
import { TenantAwarePool } from './tenant-aware-pool';

/**
 * Single Prisma client for the application, connected through the pg driver adapter.
 *
 * Tenant isolation has two layers:
 * 1. Repositories add `organizationId` from TenantContextService to every tenant-scoped query.
 * 2. PostgreSQL row-level security (migration `row_level_security`): every pooled connection
 *    is stamped with the request's tenant by TenantAwarePool, and the policies then hide every
 *    other tenant's rows even from a query that forgot its filter. Code paths that run without a
 *    tenant (sign-in, background jobs, the seed) see everything and are trusted by design — that
 *    limitation is documented in docs/security-plan.md.
 *
 * Services never call this client directly — they go through repositories.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Kept so the health probe and the metrics endpoint can report on it without a second pool. */
  readonly pool: TenantAwarePool;

  constructor(
    config: AppConfigService,
    tenantContext: TenantContextService,
    private readonly queueShutdown: QueueShutdownService,
  ) {
    const { poolMax, idleTimeoutMs, acquireTimeoutMs, statementTimeoutMs } = config.database;
    const pool = new TenantAwarePool({
      connectionString: config.database.url,
      resolveTenant: () => tenantContext.get(),
      // pg's defaults are 10 connections, no idle timeout and no acquire timeout — which means a
      // pool under pressure queues callers forever rather than failing, and a request that hangs
      // holds its connection for as long as PostgreSQL will let it. All four are configuration
      // (see DB_POOL_* in env.schema.ts) because the right numbers depend on how many API
      // instances share one PostgreSQL, and the round trip TenantAwarePool adds to every checkout
      // makes the pool size a latency decision as well as a capacity one.
      max: poolMax,
      idleTimeoutMillis: idleTimeoutMs,
      connectionTimeoutMillis: acquireTimeoutMs,
      ...(statementTimeoutMs > 0 ? { statement_timeout: statementTimeoutMs } : {}),
    });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    // Workers first. Nest runs every provider's onModuleDestroy concurrently, so a job halfway
    // through a billing sweep would otherwise lose the database under it; awaiting the drain here
    // is the only thing that orders the two. See QueueShutdownService.
    await this.queueShutdown.drain();
    await this.$disconnect();
  }
}
