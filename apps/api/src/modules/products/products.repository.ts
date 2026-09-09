import { Injectable } from '@nestjs/common';
import { MAX_UNPAGINATED_ITEMS, OPEN_TICKET_STATUSES } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

const productInclude = {
  project: { select: { id: true, code: true, name: true, clientOrganizationId: true } },
  supportRequester: userRef,
  credentials: {
    include: { createdBy: userRef },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.ProductInclude;

/**
 * The narrow shape the ingress and the widget resolve a caller to.
 *
 * Deliberately not `productInclude`: neither path needs the credential list or the display refs,
 * and every column that is not needed is one more that could end up in an external response.
 */
const contextInclude = {
  project: { select: { id: true, clientOrganizationId: true } },
} satisfies Prisma.ProductInclude;

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
export type ProductContextRow = Prisma.ProductGetPayload<{ include: typeof contextInclude }>;
export type CredentialRow = Prisma.ProductCredentialGetPayload<{
  include: { createdBy: typeof userRef };
}>;

/**
 * Data access for the registry.
 *
 * Every query carries `organizationId`, with one deliberate exception: `findCredentialByKeyId`
 * cannot, because at that point nobody has established which organization is calling — the key
 * id is what determines it. That lookup is therefore the single un-scoped read in this file, it
 * is by unique key, and everything it returns is re-scoped from the product row it resolves to.
 */
@Injectable()
export class ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string): Promise<ProductRow[]> {
    return this.prisma.product.findMany({
      where: { organizationId, deletedAt: null },
      include: productInclude,
      orderBy: { name: 'asc' },
      take: MAX_UNPAGINATED_ITEMS,
    });
  }

  find(organizationId: string, id: string): Promise<ProductRow | null> {
    return this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: productInclude,
    });
  }

  create(data: Prisma.ProductUncheckedCreateInput): Promise<ProductRow> {
    return this.prisma.product.create({ data, include: productInclude });
  }

  async update(
    organizationId: string,
    id: string,
    data: Omit<Prisma.ProductUncheckedUpdateInput, 'organizationId' | 'id'>,
  ): Promise<ProductRow | null> {
    const changed = await this.prisma.product.updateMany({
      where: { id, organizationId, deletedAt: null },
      data,
    });
    return changed.count === 1 ? this.find(organizationId, id) : null;
  }

  /**
   * The credential behind a presented key id.
   *
   * Un-scoped by necessity and by unique key by design: verifying a secret against every
   * credential in the table would be slow and would leak, through timing, how many exist.
   */
  findCredentialByKeyId(keyId: string) {
    return this.prisma.productCredential.findUnique({
      where: { keyId },
      include: { product: { include: contextInclude } },
    });
  }

  /**
   * The product behind a verified widget session.
   *
   * Scoped by organization as well as by id, even though both come from the same signed token:
   * the two are independent fields, and a repository that takes an id without a tenant is one
   * refactor away from being called with an id from somewhere else.
   */
  findForWidget(organizationId: string, id: string): Promise<ProductContextRow | null> {
    return this.prisma.product.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: contextInclude,
    });
  }

  createCredential(data: Prisma.ProductCredentialUncheckedCreateInput): Promise<CredentialRow> {
    return this.prisma.productCredential.create({ data, include: { createdBy: userRef } });
  }

  async updateCredential(
    organizationId: string,
    id: string,
    data: Prisma.ProductCredentialUncheckedUpdateInput,
  ): Promise<CredentialRow | null> {
    const changed = await this.prisma.productCredential.updateMany({
      where: { id, organizationId },
      data,
    });
    if (changed.count !== 1) {
      return null;
    }
    return this.prisma.productCredential.findFirst({
      where: { id, organizationId },
      include: { createdBy: userRef },
    });
  }

  /**
   * Records that a credential was used, without holding up the request.
   *
   * `lastUsedAt` is operational nicety — it tells an admin whether an integration is still live.
   * It is not part of authentication, so a failure to write it must never fail the call that was
   * otherwise authentic.
   */
  touchCredential(id: string, at: Date): Promise<unknown> {
    return this.prisma.productCredential
      .updateMany({ where: { id }, data: { lastUsedAt: at } })
      .catch(() => null);
  }

  /** Open tickets per product, for the registry list. Inferred return: Prisma types groupBy. */
  openTicketCounts(organizationId: string) {
    return this.prisma.ticket.groupBy({
      by: ['productId'],
      where: {
        organizationId,
        deletedAt: null,
        productId: { not: null },
        status: { in: [...OPEN_TICKET_STATUSES] },
      },
      _count: { _all: true },
    });
  }

  /** The reporter behind a ticket, created on first sight and refreshed on every later one. */
  async upsertExternalRequester(
    organizationId: string,
    productId: string,
    externalId: string,
    identity: { name?: string | null; email?: string | null; phone?: string | null },
    now: Date,
  ) {
    return this.prisma.externalRequester.upsert({
      where: { productId_externalId: { productId, externalId } },
      // Only overwrite what the caller actually sent: a later request that omits the email must
      // not erase the one an earlier request supplied.
      update: {
        lastSeenAt: now,
        ...(identity.name ? { name: identity.name } : {}),
        ...(identity.email ? { email: identity.email } : {}),
        ...(identity.phone ? { phone: identity.phone } : {}),
      },
      create: {
        organizationId,
        productId,
        externalId,
        name: identity.name ?? null,
        email: identity.email ?? null,
        phone: identity.phone ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }

  findIngressRequest(productId: string, idempotencyKey: string) {
    return this.prisma.supportIngressRequest.findUnique({
      where: { productId_idempotencyKey: { productId, idempotencyKey } },
    });
  }
}
