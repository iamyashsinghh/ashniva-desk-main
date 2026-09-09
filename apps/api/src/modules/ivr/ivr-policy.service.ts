import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  DEFAULT_MAX_CALL_ATTEMPTS,
  MAX_CALL_ATTEMPTS_LIMIT,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_POLICY,
  type AuthenticatedUser,
  type IvrPolicySummary,
  type RecordingPlaybackScope,
  type RecordingPolicy,
  type SupportTier,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { SaveIvrPolicyDto } from './dto/ivr-policy.dto';
import { IvrPolicyRepository, type ProductForCallsRow } from './ivr-policy.repository';

/**
 * The effective policy for one product, defaults filled in.
 *
 * Returned instead of the raw row so that a product with no policy row behaves identically to one
 * whose administrator saved the defaults. "Not configured" must not be a third state with its own
 * behaviour — that is how a product ends up recording calls nobody agreed to record.
 */
export interface EffectiveIvrPolicy {
  productId: string;
  productName: string;
  projectId: string | null;
  ivrEnabled: boolean;
  supportEnabled: boolean;
  supportTier: SupportTier;
  recordingPolicy: RecordingPolicy;
  recordingPlaybackScope: RecordingPlaybackScope;
  allowedTiers: SupportTier[];
  requesterInitiateEnabled: boolean;
  fallbackUserId: string | null;
  maxAttempts: number;
}

/**
 * A product's calling policy: what its support calls may do, and who may hear them afterwards.
 *
 * Reading and writing it is `ivr:manage`, which is the same permission that names the provider —
 * one role is accountable for the whole of "how this product's calls work". Client users are
 * refused before anything else happens; a product's policy is provider-internal configuration.
 */
@Injectable()
export class IvrPolicyService {
  constructor(
    private readonly policies: IvrPolicyRepository,
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async read(actor: AuthenticatedUser, productId: string): Promise<IvrPolicySummary> {
    this.assertInternal(actor);
    const product = await this.load(actor.organizationId, productId);
    return toPolicySummary(product);
  }

  async save(
    actor: AuthenticatedUser,
    productId: string,
    dto: SaveIvrPolicyDto,
  ): Promise<IvrPolicySummary> {
    this.assertInternal(actor);
    const product = await this.load(actor.organizationId, productId);

    if (dto.fallbackUserId) {
      await this.assertFallbackUsable(actor.organizationId, dto.fallbackUserId);
    }
    if (dto.maxAttempts !== undefined && dto.maxAttempts > MAX_CALL_ATTEMPTS_LIMIT) {
      throw new BadRequestException(
        `A call may try at most ${MAX_CALL_ATTEMPTS_LIMIT} destinations before it stops`,
      );
    }

    if (dto.ivrEnabled !== undefined && dto.ivrEnabled !== product.ivrEnabled) {
      await this.policies.setEnabled(actor.organizationId, productId, dto.ivrEnabled);
    }

    // Only the fields the caller sent. A partial save must not quietly reset a recording policy
    // somebody set deliberately, and `undefined` is how Prisma is told to leave a column alone.
    await this.policies.upsert(actor.organizationId, productId, {
      recordingPolicy: dto.recordingPolicy,
      recordingPlaybackScope: dto.recordingPlaybackScope,
      allowedTiers: dto.allowedTiers === undefined ? undefined : { set: dto.allowedTiers },
      requesterInitiateEnabled: dto.requesterInitiateEnabled,
      fallbackUserId: dto.fallbackUserId === undefined ? undefined : dto.fallbackUserId,
      maxAttempts: dto.maxAttempts,
      updatedById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.IVR_POLICY_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      // The changed fields, so a later reader can see what was widened and by whom. No secret
      // and no telephone number passes through here — there is none in the policy to begin with.
      after: { ...dto, product: product.code },
    });

    return this.read(actor, productId);
  }

  /**
   * The policy as the calling machinery needs it, defaults applied.
   *
   * Not permission-checked: the caller has already established who is asking and what they may
   * do. This answers only "what does this product allow", which is a fact about the product.
   */
  async effectiveFor(
    organizationId: string,
    productId: string,
  ): Promise<EffectiveIvrPolicy | null> {
    const product = await this.policies.productWithPolicy(organizationId, productId);
    return product ? toEffective(product) : null;
  }

  private async load(organizationId: string, productId: string): Promise<ProductForCallsRow> {
    const product = await this.policies.productWithPolicy(organizationId, productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  /**
   * A fallback destination has to be somebody a call could actually reach.
   *
   * Checked when it is set rather than when a call falls back to it, because a policy naming
   * somebody who left the company is a trap that springs at the worst possible moment — a call
   * nobody answered, falling back to nobody at all.
   */
  private async assertFallbackUsable(organizationId: string, userId: string): Promise<void> {
    const membership = await this.prisma.organizationMembership.count({
      where: {
        organizationId,
        userId,
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
      },
    });
    if (membership === 0) {
      throw new BadRequestException('The fallback destination must be an active member of staff');
    }
  }

  private assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('IVR configuration is internal');
    }
  }
}

/** Fills in the defaults for a product whose policy has never been saved. */
export function toEffective(product: ProductForCallsRow): EffectiveIvrPolicy {
  const policy = product.ivrPolicy;
  return {
    productId: product.id,
    productName: product.name,
    projectId: product.projectId,
    ivrEnabled: product.ivrEnabled,
    supportEnabled: product.supportEnabled,
    supportTier: product.supportTier as SupportTier,
    recordingPolicy: (policy?.recordingPolicy ?? RECORDING_POLICY.DISABLED) as RecordingPolicy,
    recordingPlaybackScope: (policy?.recordingPlaybackScope ??
      RECORDING_PLAYBACK_SCOPE.LEADS_ONLY) as RecordingPlaybackScope,
    allowedTiers: (policy?.allowedTiers ?? []) as SupportTier[],
    requesterInitiateEnabled: policy?.requesterInitiateEnabled ?? false,
    fallbackUserId: policy?.fallbackUserId ?? null,
    maxAttempts: policy?.maxAttempts ?? DEFAULT_MAX_CALL_ATTEMPTS,
  };
}

function toPolicySummary(product: ProductForCallsRow): IvrPolicySummary {
  const effective = toEffective(product);
  const policy = product.ivrPolicy;
  return {
    productId: effective.productId,
    ivrEnabled: effective.ivrEnabled,
    recordingPolicy: effective.recordingPolicy,
    recordingPlaybackScope: effective.recordingPlaybackScope,
    allowedTiers: effective.allowedTiers,
    requesterInitiateEnabled: effective.requesterInitiateEnabled,
    fallbackUser: policy?.fallbackUser ?? null,
    maxAttempts: effective.maxAttempts,
    updatedAt: policy?.updatedAt.toISOString() ?? null,
  };
}
