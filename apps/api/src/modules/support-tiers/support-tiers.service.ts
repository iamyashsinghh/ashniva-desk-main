import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  ALL_SUPPORT_TIERS,
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type SupportTier,
  type SupportTierPolicySummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TicketSlaService } from '../sla-escalations/ticket-sla.service';
import type { UpdateSupportTierPolicyDto } from './dto/support-tier.dto';
import { toTierPolicySummary, neutralSummary } from './support-tiers.mapper';
import { SupportTierPoliciesRepository } from './support-tier-policies.repository';

/**
 * Editing what a support tier is worth.
 *
 * Internal only, like the registry itself: a tier is the provider's description of what it has
 * agreed to do, and a client reading — let alone editing — another organization's entitlements
 * would be reading a commercial term it is not party to.
 *
 * A change here reapplies SLA clocks for exactly the same reason `SlaPoliciesService` does after a
 * policy edit: the tier now sits in the policy precedence, so changing which policy a tier selects
 * changes the deadlines of every open ticket that resolves through it. Leaving them on yesterday's
 * targets would make the screens and the monitor disagree about whether a ticket is late.
 */
@Injectable()
export class SupportTiersService {
  constructor(
    private readonly policies: SupportTierPoliciesRepository,
    private readonly ticketSla: TicketSlaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(actor: AuthenticatedUser): Promise<SupportTierPolicySummary[]> {
    this.assertInternal(actor);
    const rows = await this.policies.list(actor.organizationId);
    return ALL_SUPPORT_TIERS.map((tier) => {
      const row = rows.find((entry) => entry.tier === tier);
      return row ? toTierPolicySummary(row) : neutralSummary(tier);
    });
  }

  async update(
    actor: AuthenticatedUser,
    tier: SupportTier,
    dto: UpdateSupportTierPolicyDto,
  ): Promise<SupportTierPolicySummary> {
    this.assertInternal(actor);
    const before = await this.policies.find(actor.organizationId, tier);
    if (dto.slaPolicyId) {
      // Without this a tier could be pointed at another tenant's SLA policy, and every ticket of
      // that tier would take its deadlines from terms agreed with somebody else.
      const owned = await this.policies.slaPolicyExists(actor.organizationId, dto.slaPolicyId);
      if (!owned) {
        throw new BadRequestException('That SLA policy does not belong to this organization');
      }
    }
    const row = await this.policies.upsert(actor.organizationId, tier, {
      ...(dto.admissionEnabled !== undefined ? { admissionEnabled: dto.admissionEnabled } : {}),
      ...(dto.slaPolicyId !== undefined ? { slaPolicyId: dto.slaPolicyId } : {}),
      ...(dto.minimumPriority !== undefined ? { minimumPriority: dto.minimumPriority } : {}),
      ...(dto.callsEnabled !== undefined ? { callsEnabled: dto.callsEnabled } : {}),
      ...(dto.requesterInitiatedCalls !== undefined
        ? { requesterInitiatedCalls: dto.requesterInitiatedCalls }
        : {}),
      ...(dto.dedicatedOwnership !== undefined
        ? { dedicatedOwnership: dto.dedicatedOwnership }
        : {}),
      ...(dto.ackMinutes !== undefined ? { ackMinutes: dto.ackMinutes } : {}),
      ...(dto.escalationMinutes !== undefined ? { escalationMinutes: dto.escalationMinutes } : {}),
      ...(dto.fallbackStrategy !== undefined ? { fallbackStrategy: dto.fallbackStrategy } : {}),
      ...(dto.availabilityWindow !== undefined
        ? { availabilityWindow: dto.availabilityWindow }
        : {}),
      updatedById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.SUPPORT_TIER_POLICY_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: row.id,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      before: before ? toTierPolicySummary(before) : null,
      after: toTierPolicySummary(row),
    });

    // Only when the SLA selection actually moved. Reapplying rewrites the clocks of every open
    // ticket in the tenant, which is not something a change to, say, the fallback strategy should
    // cost — and a needless rewrite writes an SLA event nobody can explain.
    if ((before?.slaPolicyId ?? null) !== row.slaPolicyId) {
      await this.ticketSla.reapply(actor.organizationId);
    }
    return toTierPolicySummary(row);
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Support tiers are internal configuration');
    }
  }
}
