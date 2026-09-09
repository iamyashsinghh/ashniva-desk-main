import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export type CallbackEndpointRow = Prisma.ProductCallbackEndpointGetPayload<object>;

/**
 * Where one product's callbacks go.
 *
 * Every query carries `organizationId`, including the one the sender uses: a delivery row and its
 * endpoint have to belong to the same tenant, and the cheapest place to insist on that is the
 * lookup itself.
 */
@Injectable()
export class CallbackEndpointsRepository {
  constructor(private readonly prisma: PrismaService) {}

  find(organizationId: string, productId: string): Promise<CallbackEndpointRow | null> {
    return this.prisma.productCallbackEndpoint.findFirst({ where: { organizationId, productId } });
  }

  upsert(
    organizationId: string,
    productId: string,
    data: Omit<
      Prisma.ProductCallbackEndpointUncheckedCreateInput,
      'organizationId' | 'productId' | 'id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<CallbackEndpointRow> {
    return this.prisma.productCallbackEndpoint.upsert({
      where: { productId },
      create: { organizationId, productId, ...data },
      update: data,
    });
  }

  /** Confirms the product is this tenant's before anything is written against it. */
  async productExists(organizationId: string, productId: string): Promise<boolean> {
    const count = await this.prisma.product.count({
      where: { id: productId, organizationId, deletedAt: null },
    });
    return count > 0;
  }
}
