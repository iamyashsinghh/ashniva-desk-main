import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const POLICY_INCLUDE = {
  fallbackUser: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ProductIvrPolicyInclude;

export type IvrPolicyRow = Prisma.ProductIvrPolicyGetPayload<{ include: typeof POLICY_INCLUDE }>;

export type ProductForCallsRow = Prisma.ProductGetPayload<{
  include: { ivrPolicy: { include: typeof POLICY_INCLUDE } };
}>;

/**
 * Reading and writing a product's IVR policy.
 *
 * Every method takes `organizationId` first and puts it in the where clause, as the first layer;
 * the provider-only row-level-security policy added in 20260912090000_ivr_support_calls is the
 * second, for the query that forgets.
 */
@Injectable()
export class IvrPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The product together with whatever policy it has. One read answers the whole question. */
  productWithPolicy(organizationId: string, productId: string): Promise<ProductForCallsRow | null> {
    return this.prisma.product.findFirst({
      where: { id: productId, organizationId, deletedAt: null },
      include: { ivrPolicy: { include: POLICY_INCLUDE } },
    });
  }

  /**
   * Creates the policy, or updates the existing one.
   *
   * The unique index on `product_id` is what makes this safe against two administrators saving at
   * once: one of them loses the insert, and the upsert turns that into an update rather than a
   * second row.
   */
  upsert(
    organizationId: string,
    productId: string,
    data: Prisma.ProductIvrPolicyUncheckedUpdateInput,
  ): Promise<IvrPolicyRow> {
    return this.prisma.productIvrPolicy.upsert({
      where: { productId },
      create: {
        ...(data as Prisma.ProductIvrPolicyUncheckedCreateInput),
        // After the spread: the row's identity comes from the caller's arguments, never from
        // whatever the update payload happens to contain.
        organizationId,
        productId,
      },
      update: data,
      include: POLICY_INCLUDE,
    });
  }

  /** Flips the switch itself, which lives on the product where package 8c put it. */
  async setEnabled(organizationId: string, productId: string, enabled: boolean): Promise<number> {
    const result = await this.prisma.product.updateMany({
      where: { id: productId, organizationId, deletedAt: null },
      data: { ivrEnabled: enabled },
    });
    return result.count;
  }
}
