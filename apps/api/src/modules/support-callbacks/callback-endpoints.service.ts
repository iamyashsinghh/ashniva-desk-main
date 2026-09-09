import { randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type ProductCallbackEndpointSummary,
  type ProductCallbackEndpointWithSecret,
  type SupportCallbackDeliverySummary,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { BlockedRequestError, SafeHttpService } from '../../infrastructure/http/safe-http.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CallbackEndpointsRepository } from './callback-endpoints.repository';
import type {
  CallbackDeliveryQueryDto,
  UpsertCallbackEndpointDto,
} from './dto/support-callback.dto';
import { toDeliverySummary, toEndpointSummary } from './support-callbacks.mapper';
import { SupportCallbacksRepository } from './support-callbacks.repository';

/** 32 bytes, base64url. The same shape and the same reasoning as a machine credential's secret. */
const SECRET_BYTES = 32;

/**
 * Configuring where a product's callbacks go.
 *
 * Two rules hold here and are worth stating together, because they look inconsistent until the
 * direction is considered:
 *
 *  * the **URL** is checked with `SafeHttpService.check` at the moment it is saved, not only when
 *    a delivery is attempted. An operator who types a loopback address should be told so while
 *    they are looking at the form, rather than discovering it in a delivery log an hour later —
 *    and the same check runs again on every send, because DNS can change under a saved URL.
 *  * the **secret** is encrypted rather than hashed, which is the opposite of what
 *    `ProductCredentialsService` does. A machine secret is only ever verified, so nothing should
 *    be able to read it back. A signing secret has to be read back on every delivery in order to
 *    compute the HMAC, so it is stored reversibly and shown to the operator exactly once.
 */
@Injectable()
export class CallbackEndpointsService {
  constructor(
    private readonly endpoints: CallbackEndpointsRepository,
    private readonly deliveries: SupportCallbacksRepository,
    private readonly cipher: SecretCipherService,
    private readonly http: SafeHttpService,
    private readonly auditLog: AuditLogService,
  ) {}

  async get(
    actor: AuthenticatedUser,
    productId: string,
  ): Promise<ProductCallbackEndpointSummary | null> {
    await this.require(actor, productId);
    const row = await this.endpoints.find(actor.organizationId, productId);
    return row ? toEndpointSummary(row) : null;
  }

  /**
   * Saves the endpoint, minting a signing secret the first time.
   *
   * The secret is returned only when it was created, so an ordinary edit of the URL or the event
   * list does not put a live secret back on the wire. Rotating it is a separate, deliberate act.
   */
  async upsert(
    actor: AuthenticatedUser,
    productId: string,
    dto: UpsertCallbackEndpointDto,
  ): Promise<ProductCallbackEndpointWithSecret | { endpoint: ProductCallbackEndpointSummary }> {
    await this.require(actor, productId);
    await this.assertReachable(dto.url);

    const existing = await this.endpoints.find(actor.organizationId, productId);
    const secret = existing ? null : randomBytes(SECRET_BYTES).toString('base64url');
    const row = await this.endpoints.upsert(actor.organizationId, productId, {
      url: dto.url,
      events: dto.events ?? [],
      enabled: dto.enabled ?? true,
      // An edit keeps the secret it already had. Reissuing one on every save would break every
      // receiver whenever somebody corrected a typo in the URL.
      signingSecretEncrypted: secret
        ? this.cipher.encrypt(secret)
        : (existing?.signingSecretEncrypted ?? ''),
      updatedById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CALLBACK_CONFIGURED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      before: existing ? toEndpointSummary(existing) : null,
      // The URL and the subscription. Never the secret — this row is readable by anybody with
      // audit access.
      after: toEndpointSummary(row),
    });

    const endpoint = toEndpointSummary(row);
    return secret ? { endpoint, signingSecret: secret } : { endpoint };
  }

  /** Replaces the signing secret, keeping the endpoint. Shown once, like a machine credential. */
  async rotateSecret(
    actor: AuthenticatedUser,
    productId: string,
  ): Promise<ProductCallbackEndpointWithSecret> {
    await this.require(actor, productId);
    const existing = await this.endpoints.find(actor.organizationId, productId);
    if (!existing) {
      throw new NotFoundException('No callback endpoint is configured for this product');
    }
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    const row = await this.endpoints.upsert(actor.organizationId, productId, {
      url: existing.url,
      events: existing.events,
      enabled: existing.enabled,
      signingSecretEncrypted: this.cipher.encrypt(secret),
      rotatedAt: new Date(),
      updatedById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CALLBACK_SECRET_ROTATED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      after: { url: row.url },
    });
    return { endpoint: toEndpointSummary(row), signingSecret: secret };
  }

  async history(
    actor: AuthenticatedUser,
    productId: string,
    query: CallbackDeliveryQueryDto,
  ): Promise<SupportCallbackDeliverySummary[]> {
    await this.require(actor, productId);
    const rows = await this.deliveries.history({
      organizationId: actor.organizationId,
      productId,
      limit: query.limit ?? 50,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return rows.map(toDeliverySummary);
  }

  /**
   * Refuses a URL the server must not be made to call.
   *
   * The whole check, not a subset of it: scheme, hostname resolution and every address the name
   * answers with. `SafeHttpService.check` is the very code the delivery will run, so a URL that
   * saves is a URL that can actually be posted to, and one that cannot is refused with the reason.
   */
  private async assertReachable(url: string): Promise<void> {
    try {
      await this.http.check(url);
    } catch (error) {
      if (error instanceof BlockedRequestError) {
        throw new BadRequestException(
          `That callback URL cannot be used: it resolves to ${error.detail}`,
        );
      }
      throw error;
    }
  }

  private async require(actor: AuthenticatedUser, productId: string): Promise<void> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('The product registry is internal');
    }
    if (!(await this.endpoints.productExists(actor.organizationId, productId))) {
      throw new NotFoundException('Product not found');
    }
  }
}
