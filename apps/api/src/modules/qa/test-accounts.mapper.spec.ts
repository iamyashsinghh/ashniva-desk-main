import { CREDENTIAL_ACTION } from '@ashniva/types';

import {
  isGrantLive,
  toCredentialAccessLogRow,
  toCredentialGrantSummary,
  toTestAccountSummary,
} from './test-accounts.mapper';
import type {
  CredentialAccessLogRowData,
  CredentialGrantRow,
  TestAccountSummaryRow,
} from './test-accounts.repository';

const accountRow: TestAccountSummaryRow = {
  id: 'account-1',
  projectId: 'project-1',
  environment: 'STAGING',
  environmentId: 'env-1',
  label: 'Test Admin',
  username: 'qa-admin@example.com',
  notes: 'OTP goes to the shared inbox',
  rotationPolicy: 'AFTER_TEST',
  isActive: true,
  rotatedAt: new Date('2026-09-01T08:00:00.000Z'),
  createdAt: new Date('2026-08-01T08:00:00.000Z'),
};

describe('toTestAccountSummary', () => {
  it('returns exactly the fields the DTO declares', () => {
    // Pinned deliberately: the test fails if somebody widens the mapper, which is the moment a
    // password could start travelling with a list response.
    expect(Object.keys(toTestAccountSummary(accountRow, false)).sort()).toEqual([
      'createdAt',
      'environment',
      'environmentId',
      'hasActiveGrant',
      'id',
      'isActive',
      'label',
      'notes',
      'projectId',
      'rotatedAt',
      'rotationPolicy',
      'username',
    ]);
  });

  it('cannot pass a secret through even when the row it is given carries one', () => {
    // The repository selects no ciphertext, so this cannot happen through the normal path. The
    // mapper is written field by field so that it would not matter if it did.
    const contaminated = {
      ...accountRow,
      secretCiphertext: 'v1:iv:tag:cipher',
      secret: 'hunter2',
    } as TestAccountSummaryRow;
    const summary = toTestAccountSummary(contaminated, true);
    expect(JSON.stringify(summary)).not.toContain('hunter2');
    expect(JSON.stringify(summary)).not.toContain('v1:iv');
    expect('secretCiphertext' in summary).toBe(false);
  });

  it('says whether this caller currently holds a grant', () => {
    expect(toTestAccountSummary(accountRow, true).hasActiveGrant).toBe(true);
    expect(toTestAccountSummary(accountRow, false).hasActiveGrant).toBe(false);
  });
});

const grantRow: CredentialGrantRow = {
  id: 'grant-1',
  organizationId: 'org-1',
  testAccountId: 'account-1',
  grantedToUserId: 'user-tester',
  grantedById: 'user-lead',
  assignmentId: 'assignment-1',
  reason: 'Retest of the checkout fix',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  revealedAt: null,
  revokedAt: null,
  createdAt: new Date('2026-09-06T08:00:00.000Z'),
  testAccount: { id: 'account-1', label: 'Test Admin' },
  grantedTo: { id: 'user-tester', name: 'Tess Tester' },
  grantedBy: { id: 'user-lead', name: 'Lee Lead' },
};

describe('toCredentialGrantSummary', () => {
  it('reports the first reveal from the grant', () => {
    const revealedAt = new Date('2026-09-06T09:30:00.000Z');
    expect(toCredentialGrantSummary({ ...grantRow, revealedAt }).revealedAt).toBe(
      revealedAt.toISOString(),
    );
  });

  it('reports a grant nobody has used yet as unrevealed and live', () => {
    const summary = toCredentialGrantSummary(grantRow);
    expect(summary.revealedAt).toBeNull();
    expect(summary.isLive).toBe(true);
  });

  it('carries the assignment the grant was issued for', () => {
    expect(toCredentialGrantSummary(grantRow).assignmentId).toBe('assignment-1');
    expect(toCredentialGrantSummary({ ...grantRow, assignmentId: null }).assignmentId).toBeNull();
  });

  it('is not live once revoked or expired', () => {
    expect(toCredentialGrantSummary({ ...grantRow, revokedAt: new Date() }).isLive).toBe(false);
    expect(
      toCredentialGrantSummary({ ...grantRow, expiresAt: new Date(Date.now() - 1000) }).isLive,
    ).toBe(false);
  });
});

describe('toCredentialAccessLogRow', () => {
  const logRow: CredentialAccessLogRowData = {
    id: 'log-1',
    organizationId: 'org-1',
    grantId: 'grant-1',
    testAccountId: 'account-1',
    userId: 'user-tester',
    action: CREDENTIAL_ACTION.REVEAL,
    revealedAt: new Date('2026-09-06T09:30:00.000Z'),
    ipAddress: '10.0.0.4',
    userAgent: 'Firefox/140',
    testAccount: { id: 'account-1', label: 'Test Admin' },
    user: { id: 'user-tester', name: 'Tess Tester' },
  };

  it('answers who saw what, when and from where', () => {
    expect(toCredentialAccessLogRow(logRow)).toEqual({
      id: 'log-1',
      testAccountId: 'account-1',
      testAccountLabel: 'Test Admin',
      grantId: 'grant-1',
      userId: 'user-tester',
      userName: 'Tess Tester',
      action: CREDENTIAL_ACTION.REVEAL,
      revealedAt: '2026-09-06T09:30:00.000Z',
      ipAddress: '10.0.0.4',
    });
  });

  it('leaves the user agent out of the response', () => {
    expect(JSON.stringify(toCredentialAccessLogRow(logRow))).not.toContain('Firefox');
  });
});

describe('isGrantLive', () => {
  const now = new Date('2026-09-06T10:00:00.000Z');

  it('is true only while the grant is neither revoked nor expired', () => {
    expect(isGrantLive({ revokedAt: null, expiresAt: new Date('2026-09-06T11:00:00Z') }, now)).toBe(
      true,
    );
    expect(isGrantLive({ revokedAt: null, expiresAt: new Date('2026-09-06T09:00:00Z') }, now)).toBe(
      false,
    );
    expect(isGrantLive({ revokedAt: now, expiresAt: new Date('2026-09-06T11:00:00Z') }, now)).toBe(
      false,
    );
  });
});
