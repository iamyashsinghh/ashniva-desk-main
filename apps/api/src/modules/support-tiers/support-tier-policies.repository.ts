import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const tierPolicyInclude = {
  slaPolicy: { select: { id: true, name: true } },
} satisfies Prisma.SupportTierPolicyInclude;

export type SupportTierPolicyRow = Prisma.SupportTierPolicyGetPayload<{
  include: typeof tierPolicyInclude;
}>;

/**
 * Data access for tier entitlements.
 *
 * Every query carries `organizationId`. What a tier is worth is negotiated per organization, so a
 * lookup without a tenant would answer with somebody else's commercial terms.
 */
@Injectable()
export class SupportTierPoliciesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string): Promise<SupportTierPolicyRow[]> {
    return this.prisma.supportTierPolicy.findMany({
      where: { organizationId },
      include: tierPolicyInclude,
      orderBy: { tier: 'asc' },
    });
  }

  find(organizationId: string, tier: string): Promise<SupportTierPolicyRow | null> {
    return this.prisma.supportTierPolicy.findFirst({
      where: { organizationId, tier: tier as Prisma.SupportTierPolicyWhereInput['tier'] },
      include: tierPolicyInclude,
    });
  }

  /**
   * Writes one tier's row, creating it on first edit.
   *
   * An upsert rather than a create-then-update: there is exactly one row per (organization, tier)
   * and the unique index says so, so letting the database arbitrate costs nothing and removes the
   * window two concurrent editors would otherwise race through.
   */
  upsert(
    organizationId: string,
    tier: string,
    data: Omit<
      Prisma.SupportTierPolicyUncheckedCreateInput,
      'organizationId' | 'tier' | 'id' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<SupportTierPolicyRow> {
    const tierValue = tier as Prisma.SupportTierPolicyCreateInput['tier'];
    return this.prisma.supportTierPolicy.upsert({
      where: { organizationId_tier: { organizationId, tier: tierValue } },
      create: { organizationId, tier: tierValue, ...data },
      update: data,
      include: tierPolicyInclude,
    });
  }

  /** Confirms an SLA policy belongs to this organization before a tier is pointed at it. */
  async slaPolicyExists(organizationId: string, slaPolicyId: string): Promise<boolean> {
    const count = await this.prisma.slaPolicy.count({
      where: { id: slaPolicyId, organizationId, deletedAt: null },
    });
    return count > 0;
  }
}
