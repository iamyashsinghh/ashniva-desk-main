import { randomBytes } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CREDENTIAL_ACTION,
  CREDENTIAL_ROTATION_POLICY,
  type AuthenticatedUser,
  type TestAccountSummary,
} from '@ashniva/types';

import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  CreateTestAccountDto,
  RotateTestAccountDto,
  UpdateTestAccountDto,
} from './dto/test-account.dto';
import { QaScopeService } from './qa-scope.service';
import { toTestAccountSummary } from './test-accounts.mapper';
import { TestAccountsRepository, type TestAccountSummaryRow } from './test-accounts.repository';

const GENERATED_SECRET_BYTES = 24;

/**
 * Reusable test logins: recording them, editing them and rotating them. Handing one out is
 * `CredentialGrantsService`; reading one is `CredentialRevealService`.
 *
 * Nothing in here returns a password. Creating and rotating one takes it in, encrypts it and
 * forgets it; reading one answers with `TestAccountSummary`, whose row does not even carry the
 * ciphertext.
 */
@Injectable()
export class TestAccountsService {
  constructor(
    private readonly testAccounts: TestAccountsRepository,
    private readonly scope: QaScopeService,
    private readonly cipher: SecretCipherService,
    private readonly auditLog: AuditLogService,
  ) {}

  async listForProject(actor: AuthenticatedUser, projectId: string): Promise<TestAccountSummary[]> {
    await this.scope.assertProject(actor.organizationId, projectId);
    const rows = await this.testAccounts.listForProject(actor.organizationId, projectId);
    return this.present(actor, rows);
  }

  async create(
    actor: AuthenticatedUser,
    projectId: string,
    dto: CreateTestAccountDto,
  ): Promise<TestAccountSummary> {
    await this.scope.assertProject(actor.organizationId, projectId);
    if (dto.environmentId) {
      await this.scope.assertEnvironmentInProject(
        actor.organizationId,
        dto.environmentId,
        projectId,
      );
    }

    const row = await this.testAccounts.create(actor.organizationId, {
      projectId,
      environment: dto.environment,
      environmentId: dto.environmentId ?? null,
      label: dto.label.trim(),
      username: dto.username,
      secretCiphertext: this.cipher.encrypt(dto.secret),
      notes: dto.notes ?? null,
      rotationPolicy: dto.rotationPolicy ?? CREDENTIAL_ROTATION_POLICY.AFTER_TEST,
      resetHookUrl: dto.resetHookUrl ?? null,
      createdById: actor.userId,
    });

    // Two records, on purpose: the audit log answers "who changed the configuration", the
    // credential access log answers "what happened to this password".
    await this.testAccounts.logAccess({
      organizationId: actor.organizationId,
      testAccountId: row.id,
      userId: actor.userId,
      action: CREDENTIAL_ACTION.GENERATE,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.TEST_ACCOUNT_CREATED,
      entityType: AUDIT_ENTITY_TYPE.TEST_ACCOUNT,
      entityId: row.id,
      organizationId: actor.organizationId,
      // The password is deliberately absent: an audit entry is not a place to keep one.
      after: { projectId, environment: row.environment, label: row.label, username: row.username },
    });

    return toTestAccountSummary(row, false);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTestAccountDto,
  ): Promise<TestAccountSummary> {
    const existing = await this.require(actor, id);
    if (dto.environmentId) {
      await this.scope.assertEnvironmentInProject(
        actor.organizationId,
        dto.environmentId,
        existing.projectId,
      );
    }

    const row = await this.testAccounts.update(actor.organizationId, id, {
      ...(dto.environmentId === undefined ? {} : { environmentId: dto.environmentId }),
      ...(dto.label === undefined ? {} : { label: dto.label.trim() }),
      ...(dto.username === undefined ? {} : { username: dto.username }),
      ...(dto.notes === undefined ? {} : { notes: dto.notes }),
      ...(dto.rotationPolicy === undefined ? {} : { rotationPolicy: dto.rotationPolicy }),
      ...(dto.resetHookUrl === undefined ? {} : { resetHookUrl: dto.resetHookUrl }),
      ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.TEST_ACCOUNT_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.TEST_ACCOUNT,
      entityId: row.id,
      organizationId: actor.organizationId,
      before: { label: existing.label, username: existing.username, isActive: existing.isActive },
      after: { label: row.label, username: row.username, isActive: row.isActive },
    });

    return (await this.present(actor, [row]))[0] as TestAccountSummary;
  }

  /**
   * A new password, and every outstanding grant torn up with it.
   *
   * Leaving the grants alone would be worse than not rotating: they were issued against the old
   * password and would hand out the new one to whoever still held them.
   */
  async rotate(
    actor: AuthenticatedUser,
    id: string,
    dto: RotateTestAccountDto,
  ): Promise<TestAccountSummary> {
    const existing = await this.require(actor, id);
    const now = new Date();
    const secret = dto.secret ?? randomBytes(GENERATED_SECRET_BYTES).toString('base64url');

    const row = await this.testAccounts.update(actor.organizationId, id, {
      secretCiphertext: this.cipher.encrypt(secret),
      rotatedAt: now,
    });
    const revoked = await this.testAccounts.revokeLiveGrants(actor.organizationId, id, now);

    await this.testAccounts.logAccess({
      organizationId: actor.organizationId,
      testAccountId: id,
      userId: actor.userId,
      action: CREDENTIAL_ACTION.ROTATE,
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.TEST_ACCOUNT_ROTATED,
      entityType: AUDIT_ENTITY_TYPE.TEST_ACCOUNT,
      entityId: id,
      organizationId: actor.organizationId,
      after: {
        label: existing.label,
        generated: dto.secret === undefined,
        revokedGrants: revoked.count,
      },
    });
    if (revoked.count > 0) {
      await this.auditLog.record({
        action: AUDIT_ACTION.CREDENTIAL_REVOKED,
        entityType: AUDIT_ENTITY_TYPE.CREDENTIAL_GRANT,
        entityId: id,
        organizationId: actor.organizationId,
        after: { reason: 'rotation', count: revoked.count },
      });
    }

    return (await this.present(actor, [row]))[0] as TestAccountSummary;
  }

  private async require(actor: AuthenticatedUser, id: string): Promise<TestAccountSummaryRow> {
    const row = await this.testAccounts.findById(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Test account not found');
    }
    return row;
  }

  /** `hasActiveGrant` is per caller, so it is resolved for the whole page in one query. */
  private async present(
    actor: AuthenticatedUser,
    rows: TestAccountSummaryRow[],
  ): Promise<TestAccountSummary[]> {
    const granted = await this.testAccounts.accountIdsWithLiveGrant(
      actor.organizationId,
      actor.userId,
      rows.map((row) => row.id),
      new Date(),
    );
    return rows.map((row) => toTestAccountSummary(row, granted.has(row.id)));
  }
}
