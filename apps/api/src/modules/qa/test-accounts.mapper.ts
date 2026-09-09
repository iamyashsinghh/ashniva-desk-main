import type {
  CredentialAccessLogRow,
  CredentialGrantSummary,
  TestAccountSummary,
} from '@ashniva/types';

import type {
  CredentialAccessLogRowData,
  CredentialGrantRow,
  TestAccountSummaryRow,
} from './test-accounts.repository';

/**
 * Credential responses.
 *
 * Every field is written out by hand and no function here spreads a row. That is the second line
 * of defence; the first is that `TestAccountSummaryRow` has no `secretCiphertext` field to spread
 * in the first place (see the select in the repository). Only `CredentialRevealService` ever holds
 * a plaintext, and it builds its own response.
 */

export function toTestAccountSummary(
  row: TestAccountSummaryRow,
  hasActiveGrant: boolean,
): TestAccountSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    environment: row.environment,
    environmentId: row.environmentId,
    label: row.label,
    username: row.username,
    notes: row.notes,
    rotationPolicy: row.rotationPolicy,
    isActive: row.isActive,
    rotatedAt: row.rotatedAt?.toISOString() ?? null,
    hasActiveGrant,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCredentialGrantSummary(
  row: CredentialGrantRow,
  now = new Date(),
): CredentialGrantSummary {
  return {
    id: row.id,
    testAccountId: row.testAccountId,
    testAccountLabel: row.testAccount.label,
    grantedToUserId: row.grantedToUserId,
    grantedToName: row.grantedTo.name,
    grantedByName: row.grantedBy.name,
    assignmentId: row.assignmentId,
    reason: row.reason,
    expiresAt: row.expiresAt.toISOString(),
    // The first reveal, not the latest: a grant issued and never used is a different fact from one
    // that was read. Every reveal is in `credential_access_log`; this is just the flag.
    revealedAt: row.revealedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    isLive: isGrantLive(row, now),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCredentialAccessLogRow(row: CredentialAccessLogRowData): CredentialAccessLogRow {
  return {
    id: row.id,
    testAccountId: row.testAccountId,
    testAccountLabel: row.testAccount.label,
    grantId: row.grantId,
    userId: row.userId,
    userName: row.user.name,
    action: row.action,
    revealedAt: row.revealedAt.toISOString(),
    ipAddress: row.ipAddress,
    // userAgent is deliberately not exposed: the log answers "who saw this and when", and a full
    // user-agent string on a shared screen is fingerprinting nobody asked for.
  };
}

/** Live means: not revoked, and not yet expired. Both are checked again before any reveal. */
export function isGrantLive(
  grant: { revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): boolean {
  return grant.revokedAt === null && grant.expiresAt > now;
}
