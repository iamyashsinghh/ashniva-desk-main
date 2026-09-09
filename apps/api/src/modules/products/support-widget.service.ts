import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  WIDGET_SESSION_TTL_MINUTES,
  normalizeOrigin,
  type WidgetCapabilities,
  type WidgetSessionGrant,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { SupportTierPolicyService } from '../support-tiers/support-tier-policy.service';
import type { MintWidgetSessionDto } from './dto/support-widget.dto';
import type { AuthenticatedProduct, AuthenticatedWidget } from './product-context';
import { ProductsRepository } from './products.repository';
import { WidgetSessionService } from './widget-session.service';

/**
 * Handing a browser a session, and telling it what it may do with one.
 *
 * The exchange this file implements is the whole point of the widget's authentication model: the
 * `ask_` credential stays on the customer's server and never moves, and what crosses to the page
 * is a token that is worthless anywhere except this product, this person and this origin.
 */
@Injectable()
export class SupportWidgetService {
  constructor(
    private readonly sessions: WidgetSessionService,
    private readonly products: ProductsRepository,
    private readonly tiers: SupportTierPolicyService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Mints a session for one end user.
   *
   * The origin is checked against the product's registered list *here*, not only when the token is
   * used. Minting a token for an unregistered origin would produce something the browser could
   * never send anyway (CORS refuses it) and would leave the customer debugging a browser error
   * instead of reading a sentence about their configuration.
   */
  async mint(
    product: AuthenticatedProduct,
    dto: MintWidgetSessionDto,
    now = new Date(),
  ): Promise<WidgetSessionGrant> {
    const origin = normalizeOrigin(dto.origin);
    if (!origin) {
      throw new BadRequestException(
        'An origin is a scheme and a host, such as https://app.example.com',
      );
    }
    if (!product.allowedOrigins.includes(origin)) {
      throw new ForbiddenException(`${origin} is not a registered origin for this product`);
    }
    if (!product.supportEnabled || !product.projectId) {
      // The same uniform refusal the ingress gives: a caller learns that support is not open, not
      // which switch is off.
      throw new ForbiddenException('Support is not enabled for this product');
    }

    // Recorded now, so the first ticket already has a name to show and a way to answer. Doing it
    // at raise time would leave every session for a person who never filed anything invisible.
    await this.products.upsertExternalRequester(
      product.organizationId,
      product.productId,
      dto.externalUserId,
      { name: dto.name, email: dto.email, phone: dto.phone },
      now,
    );

    const { token, claims } = this.sessions.mint(
      {
        productId: product.productId,
        organizationId: product.organizationId,
        externalUserId: dto.externalUserId,
        origin,
        keyId: product.credentialKeyId,
      },
      now,
    );

    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_WIDGET_SESSION_ISSUED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: product.productId,
      organizationId: product.organizationId,
      // The credential's public id, the origin, the external identifier. Never the token — a
      // logged token is a usable token for as long as it lives.
      after: {
        credentialKeyId: product.credentialKeyId,
        origin,
        externalUserId: dto.externalUserId,
        ttlMinutes: WIDGET_SESSION_TTL_MINUTES,
      },
    });

    return {
      token,
      expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
      capabilities: await this.capabilities(product),
    };
  }

  /**
   * What the widget should render.
   *
   * Resolved from the registry and the tier policy on every read, so switching a capability off in
   * Desk switches the control off in every embedded copy without the customer redeploying. Each
   * refusal is a sentence meant to be shown next to a disabled control.
   */
  async capabilities(product: AuthenticatedProduct): Promise<WidgetCapabilities> {
    const policy = await this.tiers.forTier(product.organizationId, product.supportTier);
    const closed = !product.supportEnabled || !product.projectId;
    const raiseRefusal = closed
      ? 'Support is not open for this product at the moment'
      : this.tiers.raiseRefusal(policy);
    const callRefusal = !product.ivrEnabled
      ? `Support calls are switched off for ${product.name}`
      : this.tiers.callRefusal(policy, true);

    return {
      productCode: product.code,
      productName: product.name,
      canRaiseTicket: raiseRefusal === null,
      canRequestCall: raiseRefusal === null && callRefusal === null,
      unavailableReason: raiseRefusal,
      callUnavailableReason: callRefusal,
      allowedSources: product.allowedSources,
      allowedWorkAreas: product.allowedWorkAreas,
      defaultPriority: product.defaultPriority,
      defaultType: product.defaultType,
      attachmentsEnabled: true,
    };
  }

  /** The capabilities a page already holding a session reads, so it can refresh without re-minting. */
  capabilitiesFor(widget: AuthenticatedWidget): Promise<WidgetCapabilities> {
    return this.capabilities(widget.product);
  }
}
