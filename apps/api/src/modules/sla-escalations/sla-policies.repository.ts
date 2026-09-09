import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

export const slaPolicyInclude = {
  rules: { orderBy: { priority: 'asc' } },
  clientOrganization: { select: { id: true, name: true } },
  project: { select: { id: true, code: true, name: true } },
  _count: { select: { tickets: true } },
} satisfies Prisma.SlaPolicyInclude;

export type SlaPolicyRow = Prisma.SlaPolicyGetPayload<{ include: typeof slaPolicyInclude }>;

export interface SlaRuleInput {
  priority: Prisma.SlaPolicyRuleCreateManyPolicyInput['priority'];
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

/** SLA policies of the provider organization and the rule that applies to one ticket. */
@Injectable()
export class SlaPoliciesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string): Promise<SlaPolicyRow[]> {
    return this.prisma.slaPolicy.findMany({
      where: { organizationId, deletedAt: null },
      include: slaPolicyInclude,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  findById(organizationId: string, id: string): Promise<SlaPolicyRow | null> {
    return this.prisma.slaPolicy.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: slaPolicyInclude,
    });
  }

  /**
   * The policy for a ticket: its project's policy, else its support tier's, else its client's,
   * else the default. Returns null when nothing applies, which means the ticket has no SLA.
   *
   * **Why the tier sits where it does.** A project policy is the most specific statement anybody
   * can make — it names this one piece of work — so it stays first. A tier comes next because a
   * client organization may run several products at different tiers, and the tier is the narrower
   * of the two: putting it below the client policy would mean an ENTERPRISE product inheriting the
   * terms of a client-wide policy written for that client's ordinary work. The client policy and
   * the default keep their places behind it.
   *
   * @param tierPolicyId the policy this ticket's support tier selects, or null when its tier
   * selects none — which is what every unconfigured tier does, leaving the precedence exactly as
   * it was before tiers existed.
   */
  async findForTicket(
    organizationId: string,
    clientOrganizationId: string,
    projectId: string | null,
    tierPolicyId: string | null = null,
  ): Promise<SlaPolicyRow | null> {
    const candidates = await this.prisma.slaPolicy.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          ...(projectId ? [{ projectId }] : []),
          ...(tierPolicyId ? [{ id: tierPolicyId }] : []),
          { clientOrganizationId, projectId: null },
          { isDefault: true },
        ],
      },
      include: slaPolicyInclude,
    });
    return (
      candidates.find((policy) => projectId && policy.projectId === projectId) ??
      candidates.find((policy) => tierPolicyId !== null && policy.id === tierPolicyId) ??
      candidates.find(
        (policy) => policy.clientOrganizationId === clientOrganizationId && !policy.projectId,
      ) ??
      candidates.find((policy) => policy.isDefault) ??
      null
    );
  }

  create(
    data: Omit<Prisma.SlaPolicyUncheckedCreateInput, 'rules'>,
    rules: SlaRuleInput[],
  ): Promise<SlaPolicyRow> {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.slaPolicy.updateMany({
          where: { organizationId: data.organizationId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }
      return tx.slaPolicy.create({
        data: { ...data, rules: { createMany: { data: rules } } },
        include: slaPolicyInclude,
      });
    });
  }

  update(
    organizationId: string,
    id: string,
    data: Prisma.SlaPolicyUncheckedUpdateInput,
    rules?: SlaRuleInput[],
  ): Promise<SlaPolicyRow> {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.slaPolicy.updateMany({
          where: { organizationId, isDefault: true, deletedAt: null, id: { not: id } },
          data: { isDefault: false },
        });
      }
      if (rules) {
        await tx.slaPolicyRule.deleteMany({ where: { policyId: id } });
        await tx.slaPolicyRule.createMany({
          data: rules.map((rule) => ({ ...rule, policyId: id })),
        });
      }
      return tx.slaPolicy.update({ where: { id }, data, include: slaPolicyInclude });
    });
  }

  softDelete(id: string): Promise<void> {
    return this.prisma.slaPolicy
      .update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } })
      .then(() => undefined);
  }
}
