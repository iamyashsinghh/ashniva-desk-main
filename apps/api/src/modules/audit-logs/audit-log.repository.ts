import { Injectable } from '@nestjs/common';

import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export interface AuditLogEntry {
  organizationId?: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface AuditLogFilter {
  entityType?: string;
  action?: string;
  actorUserId?: string;
  organizationId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  limit: number;
  cursor?: string;
}

const auditInclude = {
  actor: { select: { id: true, name: true, email: true } },
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.AuditLogInclude;

export type AuditLogRow = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;

/** Append-only: there is intentionally no update or delete method. */
@Injectable()
export class AuditLogRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(
    filter: AuditLogFilter,
  ): Promise<{ items: AuditLogRow[]; nextCursor: string | null; total: number }> {
    const search = filter.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      AND: [
        await this.tenantScope(),
        {
          ...(filter.entityType ? { entityType: filter.entityType } : {}),
          ...(filter.action ? { action: filter.action } : {}),
          ...(filter.actorUserId ? { actorUserId: filter.actorUserId } : {}),
          ...(filter.organizationId ? { organizationId: filter.organizationId } : {}),
          ...(filter.from || filter.to ? { createdAt: { gte: filter.from, lte: filter.to } } : {}),
          ...(search
            ? {
                OR: [
                  { action: { contains: search, mode: 'insensitive' } },
                  { entityId: { contains: search } },
                ],
              }
            : {}),
        },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: auditInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  /**
   * The tenant half of the filter, written here rather than left to row-level security.
   *
   * The policy on `audit_logs` says the same thing — the provider reads every tenant, anybody
   * else reads their own rows and the ones with no organization — and it is still there. But it
   * is one layer, and it is the layer that does nothing at all if a connection is ever handed out
   * without its tenant stamp: a background job, a future pool, a mistake. Reading the whole audit
   * log is not a query to leave standing on a single check, so the same rule is stated twice.
   */
  private async tenantScope(): Promise<Prisma.AuditLogWhereInput> {
    const tenantId = this.tenantContext.get()?.organizationId;
    if (!tenantId) {
      return {};
    }
    const tenant = await this.prisma.organization.findUnique({
      where: { id: tenantId },
      select: { isServiceProvider: true },
    });
    if (tenant?.isServiceProvider) {
      return {};
    }
    return { OR: [{ organizationId: tenantId }, { organizationId: null }] };
  }

  async append(entry: AuditLogEntry): Promise<void> {
    // createMany: no RETURNING clause, so a client tenant can record an action on the provider's
    // entity even though the row-level policy would not let it read that row back.
    await this.prisma.auditLog.createMany({
      data: {
        organizationId: entry.organizationId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: toJsonValue(entry.before),
        after: toJsonValue(entry.after),
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
      },
    });
  }
}

/** Prisma Json columns accept plain JSON values; undefined means "leave null". */
function toJsonValue(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}
