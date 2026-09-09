import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  CREDENTIAL_ACTION,
  type AuthenticatedUser,
  type RevealedCredential,
} from '@ashniva/types';

import { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { isGrantLive } from './test-accounts.mapper';
import { TestAccountsRepository } from './test-accounts.repository';

/** How long the UI keeps a revealed password on screen. */
const VISIBLE_FOR_SECONDS = 60;

/** Where the caller was, for the access log. Never used for a decision — only for the record. */
export interface RevealContext {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * The one endpoint that answers with a password.
 *
 * Four things have to be true, and they are checked in this order: the grant exists in this
 * tenant, it belongs to the person asking, it is neither revoked nor expired, and the account is
 * still active. Then — and this is the part that matters — the access-log line is written and
 * awaited *before* the plaintext is decrypted and returned. A reveal whose log write fails is not
 * a reveal: the caller gets the error and no password, because a credential handed out with no
 * record of who took it is exactly what `credential_access_log` exists to prevent.
 */
@Injectable()
export class CredentialRevealService {
  constructor(
    private readonly testAccounts: TestAccountsRepository,
    private readonly cipher: SecretCipherService,
    private readonly auditLog: AuditLogService,
  ) {}

  async reveal(
    actor: AuthenticatedUser,
    grantId: string,
    context: RevealContext = {},
  ): Promise<RevealedCredential> {
    const grant = await this.testAccounts.findGrant(actor.organizationId, grantId);
    // Somebody else's grant reads as "not found", not "forbidden": an id must not be probeable.
    if (!grant || grant.grantedToUserId !== actor.userId) {
      throw new NotFoundException('Grant not found');
    }
    if (grant.revokedAt !== null) {
      throw new ForbiddenException('That grant was revoked');
    }
    if (!isGrantLive(grant)) {
      throw new ForbiddenException('That grant has expired — ask for a new one');
    }

    const account = await this.testAccounts.findSecretForReveal(
      actor.organizationId,
      grant.testAccountId,
    );
    if (!account) {
      throw new NotFoundException('Test account not found');
    }
    if (!account.isActive) {
      throw new ConflictException('That test account has been retired');
    }

    // Written and awaited before anything is decrypted. Deliberately not fire-and-forget, and
    // deliberately not after the return value is built.
    await this.testAccounts.logAccess({
      organizationId: actor.organizationId,
      testAccountId: account.id,
      userId: actor.userId,
      action: CREDENTIAL_ACTION.REVEAL,
      grantId: grant.id,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    // The grant's own "was this ever used" flag, alongside the log rather than instead of it. The
    // repository only writes it while it is null, so it stays the *first* reveal.
    await this.testAccounts.markFirstReveal(actor.organizationId, grant.id, new Date());
    await this.auditLog.record({
      action: AUDIT_ACTION.CREDENTIAL_REVEALED,
      entityType: AUDIT_ENTITY_TYPE.CREDENTIAL_GRANT,
      entityId: grant.id,
      organizationId: actor.organizationId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      after: { testAccountId: account.id, reason: grant.reason, expiresAt: grant.expiresAt },
    });

    return {
      username: account.username,
      secret: this.cipher.decrypt(account.secretCiphertext),
      visibleForSeconds: VISIBLE_FOR_SECONDS,
      expiresAt: grant.expiresAt.toISOString(),
    };
  }
}
