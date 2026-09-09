import { Injectable } from '@nestjs/common';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';

/** How long an answer is reused. A newly registered origin starts working within this window. */
export const ORIGIN_CACHE_TTL_MS = 30_000;

/**
 * The path prefix the widget routes live under, matched by the CORS delegate.
 *
 * Anchored at the mount point — `API_GLOBAL_PREFIX` plus the URI version, so `/api/v1/support/…` —
 * and matched against a path with the query string already removed. An unanchored pattern is a
 * CORS bypass rather than a convenience: `GET /api/v1/tickets?ref=/support/widget` would otherwise
 * be answered under the widget's rules, and every origin any tenant had registered would be
 * reflected back on a first-party route. The reverse case is just as bad in the other direction —
 * a first-party request whose query happened to contain the substring would silently lose
 * `credentials: true` and stop working.
 */
export const WIDGET_ROUTE_PATTERN = /^\/api\/v\d+\/support\/widget(\/|$)/;

/**
 * Which browser origins are allowed to talk to the widget routes at all.
 *
 * A CORS preflight arrives before any token: the browser is asking whether it may send the real
 * request, and there is nothing to authenticate it with. So the only question that can be answered
 * at that point is "has some tenant registered this origin against a live product", and that is
 * all this answers — a boolean about a string the browser already knows.
 *
 * Cached, because a preflight for an unregistered origin is otherwise a free database query for
 * anybody who can make an OPTIONS request. Thirty seconds is short enough that an operator adding
 * an origin does not have to restart anything and long enough that a flood costs one query.
 *
 * Reading across tenants is the point and is safe here: the result is a set of hostnames operators
 * chose to publish a support widget on, not tenant data. It runs as the system actor because there
 * is no tenant to run as — the request has not been authenticated yet.
 */
@Injectable()
export class WidgetOriginRegistry {
  private cache: { at: number; origins: Set<string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async isRegistered(origin: string | undefined, now = Date.now()): Promise<boolean> {
    if (!origin) {
      return false;
    }
    const origins = await this.load(now);
    return origins.has(origin);
  }

  /** Drops the cache so a change made in this process is visible immediately. */
  invalidate(): void {
    this.cache = null;
  }

  private async load(now: number): Promise<Set<string>> {
    if (this.cache && now - this.cache.at < ORIGIN_CACHE_TTL_MS) {
      return this.cache.origins;
    }
    const rows = await this.tenantContext.runAsSystem(() =>
      this.prisma.product.findMany({
        where: {
          deletedAt: null,
          isActive: true,
          supportEnabled: true,
          allowedOrigins: { isEmpty: false },
        },
        select: { allowedOrigins: true },
      }),
    );
    const origins = new Set(rows.flatMap((row) => row.allowedOrigins));
    this.cache = { at: now, origins };
    return origins;
  }
}
