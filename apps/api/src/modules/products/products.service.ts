import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PRODUCT_CODE_PATTERN,
  normalizeOrigin,
  normalizeWorkAreas,
  type AuthenticatedUser,
  type ProductDetail,
  type ProductSummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { boundedList } from '../../common/dto/unpaginated-list';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TicketSlaService } from '../sla-escalations/ticket-sla.service';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { toProductDetail, toProductSummary } from './products.mapper';
import { ProductsRepository } from './products.repository';
import { WidgetOriginRegistry } from './widget-origin.registry';

/**
 * The registry, from the admin side.
 *
 * A product is provider-internal configuration — which team answers for which software — so every
 * method refuses a client user before it does anything else. What the *ingress* is allowed to do
 * with a product is decided in `SupportIngressService`; nothing here is reachable with a machine
 * credential.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly ticketSla: TicketSlaService,
    private readonly origins: WidgetOriginRegistry,
  ) {}

  async list(actor: AuthenticatedUser): Promise<ProductSummary[]> {
    this.assertInternal(actor);
    const [rows, counts] = await Promise.all([
      this.products.list(actor.organizationId),
      this.products.openTicketCounts(actor.organizationId),
    ]);
    const openBy = new Map(counts.map((row) => [row.productId, row._count._all]));
    return boundedList(
      'GET /products',
      rows.map((row) => toProductSummary(row, openBy.get(row.id) ?? 0)),
    );
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ProductDetail> {
    this.assertInternal(actor);
    const row = await this.products.find(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Product not found');
    }
    const counts = await this.products.openTicketCounts(actor.organizationId);
    return toProductDetail(row, counts.find((entry) => entry.productId === id)?._count._all ?? 0);
  }

  async create(actor: AuthenticatedUser, dto: CreateProductDto): Promise<ProductDetail> {
    this.assertInternal(actor);
    const code = dto.code.trim().toUpperCase();
    if (!PRODUCT_CODE_PATTERN.test(code)) {
      throw new BadRequestException(
        'A product code is 2–24 characters: a letter, then letters, digits, hyphen or underscore',
      );
    }
    await this.assertCodeFree(actor.organizationId, code);
    await this.assertLinks(actor.organizationId, dto.projectId, dto.supportRequesterId);

    const row = await this.products.create({
      organizationId: actor.organizationId,
      code,
      name: dto.name.trim(),
      description: dto.description ?? null,
      projectId: dto.projectId ?? null,
      supportRequesterId: dto.supportRequesterId ?? null,
      ...(dto.supportEnabled !== undefined ? { supportEnabled: dto.supportEnabled } : {}),
      ...(dto.autoRouteEnabled !== undefined ? { autoRouteEnabled: dto.autoRouteEnabled } : {}),
      ...(dto.ivrEnabled !== undefined ? { ivrEnabled: dto.ivrEnabled } : {}),
      ...(dto.supportTier ? { supportTier: dto.supportTier } : {}),
      ...(dto.allowedSources ? { allowedSources: dto.allowedSources } : {}),
      ...(dto.allowedWorkAreas
        ? { allowedWorkAreas: normalizeWorkAreas(dto.allowedWorkAreas) }
        : {}),
      ...(dto.allowedOrigins ? { allowedOrigins: this.assertOrigins(dto.allowedOrigins) } : {}),
      ...(dto.defaultPriority ? { defaultPriority: dto.defaultPriority } : {}),
      ...(dto.defaultType ? { defaultType: dto.defaultType } : {}),
      createdById: actor.userId,
    });
    // The registry answers CORS preflights from a cache that was loaded before this product
    // existed, so without this a widget on a brand-new product is blocked for up to the cache TTL
    // — and the operator has no way to tell that from a mistyped origin.
    this.origins.invalidate();
    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CREATED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: { code, name: row.name, projectId: row.projectId },
    });
    return toProductDetail(row);
  }

  /**
   * Changes a product's configuration.
   *
   * The three switches that change what the outside world can do — support, automatic routing and
   * IVR — and the project link are audited as their own actions rather than folded into a generic
   * "updated". Somebody reading the history six months later wants to find *when support was
   * turned off*, not to diff two JSON blobs to discover it.
   */
  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductDetail> {
    this.assertInternal(actor);
    const before = await this.products.find(actor.organizationId, id);
    if (!before) {
      throw new NotFoundException('Product not found');
    }
    await this.assertLinks(actor.organizationId, dto.projectId, dto.supportRequesterId);

    const row = await this.products.update(actor.organizationId, id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
      ...(dto.supportRequesterId !== undefined
        ? { supportRequesterId: dto.supportRequesterId }
        : {}),
      ...(dto.supportEnabled !== undefined ? { supportEnabled: dto.supportEnabled } : {}),
      ...(dto.autoRouteEnabled !== undefined ? { autoRouteEnabled: dto.autoRouteEnabled } : {}),
      ...(dto.ivrEnabled !== undefined ? { ivrEnabled: dto.ivrEnabled } : {}),
      ...(dto.supportTier !== undefined ? { supportTier: dto.supportTier } : {}),
      ...(dto.allowedSources !== undefined ? { allowedSources: dto.allowedSources } : {}),
      ...(dto.allowedWorkAreas !== undefined
        ? { allowedWorkAreas: normalizeWorkAreas(dto.allowedWorkAreas) }
        : {}),
      ...(dto.allowedOrigins !== undefined
        ? { allowedOrigins: this.assertOrigins(dto.allowedOrigins) }
        : {}),
      ...(dto.defaultPriority !== undefined ? { defaultPriority: dto.defaultPriority } : {}),
      ...(dto.defaultType !== undefined ? { defaultType: dto.defaultType } : {}),
    });
    if (!row) {
      throw new NotFoundException('Product not found');
    }

    if (dto.projectId !== undefined && dto.projectId !== before.projectId) {
      await this.record(actor, AUDIT_ACTION.PRODUCT_PROJECT_LINKED, id, {
        from: before.projectId,
        to: row.projectId,
      });
    }
    for (const [key, was, now] of [
      ['supportEnabled', before.supportEnabled, row.supportEnabled],
      ['autoRouteEnabled', before.autoRouteEnabled, row.autoRouteEnabled],
      ['ivrEnabled', before.ivrEnabled, row.ivrEnabled],
    ] as const) {
      if (was !== now) {
        await this.record(actor, AUDIT_ACTION.PRODUCT_SUPPORT_TOGGLED, id, { [key]: now });
      }
    }

    /**
     * A tier change is its own action, and its own consequence.
     *
     * Until the tier drove anything it was fair to let it disappear inside a generic update. Now
     * that it selects an SLA policy and can set acknowledgement and escalation minutes, "when did
     * this become PRIORITY" is a question somebody will have to answer against a breached target,
     * and diffing two JSON blobs six months later is not an answer.
     *
     * The reapply is the same call `SlaPoliciesService` makes after editing a policy, for the same
     * reason: the tier now sits in the policy precedence, so open tickets of this product would
     * otherwise keep yesterday's deadlines while every screen showed today's rules.
     */
    if (dto.supportTier !== undefined && dto.supportTier !== before.supportTier) {
      await this.record(actor, AUDIT_ACTION.PRODUCT_TIER_CHANGED, id, {
        from: before.supportTier,
        to: row.supportTier,
      });
      await this.ticketSla.reapply(actor.organizationId);
    }
    // The registry answers CORS preflights from a cache built from exactly these three fields, so
    // an operator adding an origin — or deactivating a product to stop its widget — would
    // otherwise wait for the cache to expire before anything they did took effect.
    if (
      dto.allowedOrigins !== undefined ||
      dto.isActive !== undefined ||
      dto.supportEnabled !== undefined
    ) {
      this.origins.invalidate();
    }
    if (dto.allowedOrigins !== undefined) {
      if (!sameOrigins(before.allowedOrigins, row.allowedOrigins)) {
        await this.record(actor, AUDIT_ACTION.PRODUCT_ORIGINS_CHANGED, id, {
          from: before.allowedOrigins,
          to: row.allowedOrigins,
        });
      }
    }
    await this.record(actor, AUDIT_ACTION.PRODUCT_UPDATED, id, { code: row.code, name: row.name });
    return toProductDetail(row);
  }

  /**
   * Normalises the origin list, refusing anything that is not one.
   *
   * Refused rather than silently dropped. An operator who typed `https://example.com/support` or
   * `*.example.com` believes they have registered something; leaving them with a shorter list than
   * they submitted and no message is how a widget ends up mysteriously blocked in production.
   */
  private assertOrigins(values: string[]): string[] {
    const normalized: string[] = [];
    for (const value of values) {
      const origin = normalizeOrigin(value);
      if (!origin) {
        throw new BadRequestException(
          `${value} is not a browser origin — use a scheme and a host, such as https://app.example.com`,
        );
      }
      if (!normalized.includes(origin)) {
        normalized.push(origin);
      }
    }
    return normalized;
  }

  private record(
    actor: AuthenticatedUser,
    action: string,
    productId: string,
    after: Record<string, unknown>,
  ) {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      after,
    });
  }

  private async assertCodeFree(organizationId: string, code: string): Promise<void> {
    const clash = await this.prisma.product.count({
      where: { organizationId, code, deletedAt: null },
    });
    if (clash > 0) {
      throw new BadRequestException(`A product with the code ${code} already exists`);
    }
  }

  /**
   * Both links have to be ours.
   *
   * Without this a product could be pointed at another tenant's project, and every ticket it
   * raised would land on that tenant's team — the registry turning into a way across the boundary
   * rather than a way to describe what is inside it.
   */
  private async assertLinks(
    organizationId: string,
    projectId?: string | null,
    supportRequesterId?: string | null,
  ): Promise<void> {
    if (projectId) {
      const project = await this.prisma.project.count({
        where: { id: projectId, organizationId, deletedAt: null },
      });
      if (project === 0) {
        throw new BadRequestException('That project does not belong to this organization');
      }
    }
    if (supportRequesterId) {
      const member = await this.prisma.organizationMembership.count({
        where: { userId: supportRequesterId, deletedAt: null },
      });
      if (member === 0) {
        throw new BadRequestException('The support requester must be an existing Desk user');
      }
    }
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The product registry is internal');
    }
  }
}

/** Order is not meaningful in an origin list, so a reordering is not a change worth recording. */
function sameOrigins(before: readonly string[], after: readonly string[]): boolean {
  return before.length === after.length && before.every((origin) => after.includes(origin));
}
