import { randomBytes, randomUUID } from 'node:crypto';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  formatMachineCredential,
  type AuthenticatedUser,
  type CreatedProductCredential,
  type ProductCredentialSummary,
} from '@ashniva/types';

import { PasswordHashingService } from '../auth/password-hashing.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { AuthenticatedProduct } from './product-context';
import { toAuthenticatedProduct, toCredentialSummary } from './products.mapper';
import { ProductsRepository } from './products.repository';

/** 32 bytes of randomness, base64url. Long enough that guessing is not a strategy. */
const SECRET_BYTES = 32;

/**
 * Issuing, verifying, rotating and revoking machine credentials.
 *
 * The secret is shown exactly once — at creation and at rotation — because only its argon2id hash
 * is kept. That is a stronger choice than the encryption used for test-account passwords, and the
 * difference is intentional: a test password has to be *read back* by a tester, whereas nothing
 * in Desk ever needs to read a machine secret. Where the only operation is verification, storing
 * anything reversible is a liability with no matching benefit.
 */
@Injectable()
export class ProductCredentialsService {
  constructor(
    private readonly products: ProductsRepository,
    private readonly hashing: PasswordHashingService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Verifies a presented credential and resolves the product behind it.
   *
   * Returns null for every kind of refusal rather than throwing per case: the caller turns all of
   * them into one uniform 401, so a probe cannot distinguish a wrong secret from a revoked key
   * from a product whose support has been switched off.
   */
  async authenticate(keyId: string, secret: string): Promise<AuthenticatedProduct | null> {
    const row = await this.products.findCredentialByKeyId(keyId);
    if (!row) {
      return null;
    }
    // Order matters for cost, not for correctness: the cheap state checks run before the
    // deliberately expensive hash comparison.
    if (!row.isActive || row.revokedAt !== null) {
      return null;
    }
    const product = row.product;
    if (!product || product.deletedAt !== null || !product.isActive) {
      return null;
    }
    const matches = await this.hashing.verify(row.secretHash, secret);
    if (!matches) {
      return null;
    }

    void this.products.touchCredential(row.id, new Date());

    return toAuthenticatedProduct(product, { credentialId: row.id, credentialKeyId: row.keyId });
  }

  async issue(
    actor: AuthenticatedUser,
    productId: string,
    label: string,
  ): Promise<CreatedProductCredential> {
    const product = await this.products.find(actor.organizationId, productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const { keyId, secret, hash } = await this.mint();
    const row = await this.products.createCredential({
      organizationId: actor.organizationId,
      productId,
      keyId,
      secretHash: hash,
      label,
      createdById: actor.userId,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CREDENTIAL_CREATED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      // The key id, never the secret. This row is readable by anybody with audit access.
      after: { credentialId: row.id, keyId, label },
    });
    return { credential: toCredentialSummary(row), secret: formatMachineCredential(keyId, secret) };
  }

  /**
   * Replaces a credential's secret, keeping its identity.
   *
   * The key id changes too. Rotation that kept the same id would leave an old secret and a new
   * one both matching the same public half for as long as anybody had the old string written
   * down, and "which of the two is live" is not a question an audit trail should have to answer.
   */
  async rotate(
    actor: AuthenticatedUser,
    productId: string,
    credentialId: string,
  ): Promise<CreatedProductCredential> {
    const product = await this.products.find(actor.organizationId, productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const existing = product.credentials.find((row) => row.id === credentialId);
    if (!existing) {
      throw new NotFoundException('Credential not found');
    }
    if (existing.revokedAt !== null) {
      throw new BadRequestException('A revoked credential cannot be rotated — issue a new one');
    }

    const { keyId, secret, hash } = await this.mint();
    const row = await this.products.updateCredential(actor.organizationId, credentialId, {
      keyId,
      secretHash: hash,
      isActive: true,
      rotatedAt: new Date(),
      lastUsedAt: null,
    });
    if (!row) {
      throw new NotFoundException('Credential not found');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CREDENTIAL_ROTATED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      before: { keyId: existing.keyId },
      after: { credentialId, keyId },
    });
    return { credential: toCredentialSummary(row), secret: formatMachineCredential(keyId, secret) };
  }

  async revoke(
    actor: AuthenticatedUser,
    productId: string,
    credentialId: string,
  ): Promise<ProductCredentialSummary> {
    const product = await this.products.find(actor.organizationId, productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const row = await this.products.updateCredential(actor.organizationId, credentialId, {
      isActive: false,
      revokedAt: new Date(),
    });
    if (!row) {
      throw new NotFoundException('Credential not found');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.PRODUCT_CREDENTIAL_REVOKED,
      entityType: AUDIT_ENTITY_TYPE.PRODUCT,
      entityId: productId,
      organizationId: actor.organizationId,
      after: { credentialId, keyId: row.keyId },
    });
    return toCredentialSummary(row);
  }

  private async mint(): Promise<{ keyId: string; secret: string; hash: string }> {
    const keyId = randomUUID().replaceAll('-', '');
    const secret = randomBytes(SECRET_BYTES).toString('base64url');
    return { keyId, secret, hash: await this.hashing.hash(secret) };
  }
}
