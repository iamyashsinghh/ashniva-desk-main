import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

export interface TenantContext {
  organizationId?: string;
  userId?: string;
  requestId?: string;
}

/**
 * Request-scoped tenant information without request-scoped providers.
 * The middleware opens a store per request; the JWT guard fills it; repositories (Phase 1)
 * read it to add `organizationId` to every query. Nothing outside a request sees a context.
 */
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(initial: TenantContext, callback: () => T): T {
    return this.storage.run({ ...initial }, callback);
  }

  /**
   * Runs `callback` with no tenant, so row-level security sees a system actor. Only for
   * provider-side bookkeeping triggered by a client action (for example computing a ticket's
   * SLA from provider-wide policies the client tenant cannot read). The request id is kept
   * for logs; the caller must still scope every query it writes.
   */
  runAsSystem<T>(callback: () => Promise<T>): Promise<T> {
    const requestId = this.storage.getStore()?.requestId;
    return this.storage.run({ requestId }, callback);
  }

  set(update: Partial<TenantContext>): void {
    const store = this.storage.getStore();
    if (store) {
      Object.assign(store, update);
    }
  }

  get(): TenantContext | undefined {
    return this.storage.getStore();
  }

  /** Throws when called outside an authenticated request — a bug, not a user error. */
  requireOrganizationId(): string {
    const organizationId = this.storage.getStore()?.organizationId;
    if (!organizationId) {
      throw new Error(
        'Tenant context has no organizationId (call inside an authenticated request)',
      );
    }
    return organizationId;
  }
}
