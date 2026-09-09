import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTION, CREDENTIAL_ACTION, type AuthenticatedUser } from '@ashniva/types';

import type { SecretCipherService } from '../../common/crypto/secret-cipher.service';
import type { AuditLogService } from '../audit-logs/audit-log.service';
import { CredentialRevealService } from './credential-reveal.service';
import type { CredentialGrantRow, TestAccountsRepository } from './test-accounts.repository';

const ME = 'user-tester';
const OTHER = 'user-other';
const ORG = 'org-1';

const actor = { userId: ME, organizationId: ORG } as AuthenticatedUser;

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);
const anHourAgo = () => new Date(Date.now() - 60 * 60 * 1000);

function grantRow(overrides: Partial<CredentialGrantRow> = {}): CredentialGrantRow {
  return {
    id: 'grant-1',
    organizationId: ORG,
    testAccountId: 'account-1',
    grantedToUserId: ME,
    grantedById: 'user-lead',
    assignmentId: 'assignment-1',
    reason: 'Retest of the checkout fix',
    expiresAt: inAnHour(),
    revealedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    testAccount: { id: 'account-1', label: 'Test Admin' },
    grantedTo: { id: ME, name: 'Tess Tester' },
    grantedBy: { id: 'user-lead', name: 'Lee Lead' },
    ...overrides,
  };
}

function build(
  overrides: {
    grant?: CredentialGrantRow | null;
    isActive?: boolean;
    accountFound?: boolean;
    logThrows?: boolean;
  } = {},
) {
  const order: string[] = [];
  const testAccounts = {
    findGrant: jest.fn(async () => (overrides.grant === undefined ? grantRow() : overrides.grant)),
    findSecretForReveal: jest.fn(async () =>
      overrides.accountFound === false
        ? null
        : {
            id: 'account-1',
            username: 'qa-admin@example.com',
            secretCiphertext: 'v1:cipher',
            isActive: overrides.isActive !== false,
          },
    ),
    logAccess: jest.fn(async () => {
      order.push('log');
      if (overrides.logThrows) {
        throw new Error('access log unavailable');
      }
      return { id: 'log-1' };
    }),
    markFirstReveal: jest.fn(async () => {
      order.push('mark');
      return { count: 1 };
    }),
  };
  const cipher = {
    decrypt: jest.fn((_payload: string) => {
      order.push('decrypt');
      return 'hunter2';
    }),
  };
  const auditLog = { record: jest.fn(async () => undefined) };

  const service = new CredentialRevealService(
    testAccounts as unknown as TestAccountsRepository,
    cipher as unknown as SecretCipherService,
    auditLog as unknown as AuditLogService,
  );
  return { service, testAccounts, cipher, auditLog, order };
}

describe('CredentialRevealService — the log comes first', () => {
  it('writes the access-log line before it decrypts anything', async () => {
    const { service, order } = build();
    await service.reveal(actor, 'grant-1');
    // Not cosmetic: a password that leaves the process before the record of who took it exists is
    // exactly what credential_access_log is for.
    expect(order).toEqual(['log', 'mark', 'decrypt']);
  });

  it("stamps the grant's first-reveal flag, in this tenant", async () => {
    const { service, testAccounts } = build();
    await service.reveal(actor, 'grant-1');
    expect(testAccounts.markFirstReveal).toHaveBeenCalledWith(ORG, 'grant-1', expect.any(Date));
  });

  it('stamps it on a second reveal too — the repository is what keeps it the first', async () => {
    // `markFirstReveal` only writes while revealedAt is null, so the service can call it every
    // time without turning the column into "latest reveal".
    const { service, testAccounts } = build({ grant: grantRow({ revealedAt: anHourAgo() }) });
    await service.reveal(actor, 'grant-1');
    expect(testAccounts.markFirstReveal).toHaveBeenCalledTimes(1);
  });

  it('records the grant, the account and where the caller was', async () => {
    const { service, testAccounts } = build();
    await service.reveal(actor, 'grant-1', { ipAddress: '10.0.0.4', userAgent: 'Firefox' });
    expect(testAccounts.logAccess).toHaveBeenCalledWith({
      organizationId: ORG,
      testAccountId: 'account-1',
      userId: ME,
      action: CREDENTIAL_ACTION.REVEAL,
      grantId: 'grant-1',
      ipAddress: '10.0.0.4',
      userAgent: 'Firefox',
    });
  });

  it('returns no password when the log cannot be written', async () => {
    const { service, cipher, testAccounts } = build({ logThrows: true });
    await expect(service.reveal(actor, 'grant-1')).rejects.toThrow('access log unavailable');
    expect(cipher.decrypt).not.toHaveBeenCalled();
    expect(testAccounts.markFirstReveal).not.toHaveBeenCalled();
  });

  it('audits the reveal as well', async () => {
    const { service, auditLog } = build();
    await service.reveal(actor, 'grant-1');
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AUDIT_ACTION.CREDENTIAL_REVEALED, entityId: 'grant-1' }),
    );
  });
});

describe('CredentialRevealService — what it hands back', () => {
  it('returns the username, the decrypted secret and how long to show it', async () => {
    const { service } = build();
    const revealed = await service.reveal(actor, 'grant-1');
    expect(revealed).toMatchObject({
      username: 'qa-admin@example.com',
      secret: 'hunter2',
      visibleForSeconds: 60,
    });
    expect(typeof revealed.expiresAt).toBe('string');
  });

  it('returns the decrypted secret, never the stored ciphertext', async () => {
    const { service, cipher } = build();
    const revealed = await service.reveal(actor, 'grant-1');
    expect(cipher.decrypt).toHaveBeenCalledWith('v1:cipher');
    expect(JSON.stringify(revealed)).not.toContain('v1:cipher');
  });
});

describe('CredentialRevealService — the grant has to be yours, live and usable', () => {
  it('refuses a grant that does not exist', async () => {
    const { service, cipher } = build({ grant: null });
    await expect(service.reveal(actor, 'grant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it("reports somebody else's grant as not found rather than forbidden", async () => {
    // A 403 would confirm the id exists; ids must not be probeable.
    const { service, cipher } = build({ grant: grantRow({ grantedToUserId: OTHER }) });
    await expect(service.reveal(actor, 'grant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it('refuses a revoked grant', async () => {
    const { service, testAccounts } = build({ grant: grantRow({ revokedAt: anHourAgo() }) });
    await expect(service.reveal(actor, 'grant-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(testAccounts.logAccess).not.toHaveBeenCalled();
  });

  it('refuses an expired grant', async () => {
    const { service, cipher } = build({ grant: grantRow({ expiresAt: anHourAgo() }) });
    await expect(service.reveal(actor, 'grant-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it('refuses a retired test account even on a live grant', async () => {
    const { service, cipher } = build({ isActive: false });
    await expect(service.reveal(actor, 'grant-1')).rejects.toBeInstanceOf(ConflictException);
    expect(cipher.decrypt).not.toHaveBeenCalled();
  });

  it("looks the grant up inside the caller's tenant", async () => {
    const { service, testAccounts } = build();
    await service.reveal(actor, 'grant-1');
    expect(testAccounts.findGrant).toHaveBeenCalledWith(ORG, 'grant-1');
    expect(testAccounts.findSecretForReveal).toHaveBeenCalledWith(ORG, 'account-1');
  });
});
