import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { CredentialAction, Prisma, TestEnvironmentKind } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true } } as const;

/**
 * Everything about a test account except its password.
 *
 * A `select` rather than an `include`, and `secretCiphertext` is deliberately absent. That makes
 * the omission a type, not a habit: `TestAccountSummaryRow` has no secret field, so no mapper,
 * spread or debug log downstream of this can leak one. The only way back to the ciphertext is
 * `findSecretForReveal` below, which one service calls.
 *
 * Exported so that anything joining to a test account — the assignment detail, for one — reuses
 * this select instead of writing its own and quietly widening it.
 */
export const testAccountFields = {
  id: true,
  projectId: true,
  environment: true,
  environmentId: true,
  label: true,
  username: true,
  notes: true,
  rotationPolicy: true,
  isActive: true,
  rotatedAt: true,
  createdAt: true,
} satisfies Prisma.TestAccountSelect;

export type TestAccountSummaryRow = Prisma.TestAccountGetPayload<{
  select: typeof testAccountFields;
}>;

/** Just enough to call an account's reset endpoint and say in the log which account it was. */
export interface ResetHookRow {
  id: string;
  label: string;
  username: string;
  environment: TestEnvironmentKind;
  resetHookUrl: string | null;
}

/**
 * A grant with the names a reader needs.
 *
 * `revealedAt` is a column on the grant — the cheap "was this ever used" flag, set on the first
 * reveal and not moved afterwards. The full record of every reveal stays in
 * `credential_access_log`, which is what `GET /credential-access-log` reads.
 */
const grantInclude = {
  testAccount: { select: { id: true, label: true } },
  grantedTo: userRef,
  grantedBy: userRef,
} satisfies Prisma.CredentialGrantInclude;

export type CredentialGrantRow = Prisma.CredentialGrantGetPayload<{
  include: typeof grantInclude;
}>;

const accessLogInclude = {
  testAccount: { select: { id: true, label: true } },
  user: userRef,
} satisfies Prisma.CredentialAccessLogInclude;

export type CredentialAccessLogRowData = Prisma.CredentialAccessLogGetPayload<{
  include: typeof accessLogInclude;
}>;

export interface AccessLogFilter {
  organizationId: string;
  testAccountId?: string;
  userId?: string;
  projectId?: string;
  limit: number;
  cursor?: string;
}

export interface LogAccessInput {
  organizationId: string;
  testAccountId: string;
  userId: string;
  action: CredentialAction;
  grantId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Test accounts, their grants and the access log. Every query carries `organizationId`. */
@Injectable()
export class TestAccountsRepository {
  constructor(private readonly prisma: PrismaService) {}

  listForProject(organizationId: string, projectId: string): Promise<TestAccountSummaryRow[]> {
    return this.prisma.testAccount.findMany({
      where: { organizationId, projectId, deletedAt: null },
      select: testAccountFields,
      orderBy: [{ environment: 'asc' }, { label: 'asc' }],
    });
  }

  findById(organizationId: string, id: string): Promise<TestAccountSummaryRow | null> {
    return this.prisma.testAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: testAccountFields,
    });
  }

  /**
   * The reset endpoint of one account, read on its own.
   *
   * Kept out of `testAccountFields` deliberately: the hook is an internal operations detail that
   * one service calls and nothing renders, and widening the shared select would put it on every
   * assignment detail and account list that joins through it.
   */
  findResetHook(organizationId: string, id: string): Promise<ResetHookRow | null> {
    return this.prisma.testAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, label: true, username: true, environment: true, resetHookUrl: true },
    });
  }

  create(
    organizationId: string,
    data: Omit<Prisma.TestAccountUncheckedCreateInput, 'organizationId'>,
  ): Promise<TestAccountSummaryRow> {
    return this.prisma.testAccount.create({
      data: { ...data, organizationId },
      select: testAccountFields,
    });
  }

  update(
    organizationId: string,
    id: string,
    data: Prisma.TestAccountUncheckedUpdateInput,
  ): Promise<TestAccountSummaryRow> {
    return this.prisma.testAccount.update({
      where: { id, organizationId },
      data,
      select: testAccountFields,
    });
  }

  /** Which of these accounts the caller may currently reveal, so the UI can show one button. */
  async accountIdsWithLiveGrant(
    organizationId: string,
    userId: string,
    testAccountIds: string[],
    now: Date,
  ): Promise<Set<string>> {
    if (testAccountIds.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.credentialGrant.findMany({
      where: {
        organizationId,
        grantedToUserId: userId,
        testAccountId: { in: testAccountIds },
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { testAccountId: true },
    });
    return new Set(rows.map((row) => row.testAccountId));
  }

  createGrant(
    organizationId: string,
    data: Omit<Prisma.CredentialGrantUncheckedCreateInput, 'organizationId'>,
  ): Promise<CredentialGrantRow> {
    return this.prisma.credentialGrant.create({
      data: { ...data, organizationId },
      include: grantInclude,
    });
  }

  findGrant(organizationId: string, id: string): Promise<CredentialGrantRow | null> {
    return this.prisma.credentialGrant.findFirst({
      where: { id, organizationId },
      include: grantInclude,
    });
  }

  /**
   * Stamps the first reveal.
   *
   * `revealedAt: null` is part of the where clause rather than an if in the service: it makes the
   * database refuse the second write, so the column keeps meaning *first* reveal even when two
   * requests arrive together.
   */
  markFirstReveal(organizationId: string, id: string, now: Date): Promise<{ count: number }> {
    return this.prisma.credentialGrant.updateMany({
      where: { id, organizationId, revealedAt: null },
      data: { revealedAt: now },
    });
  }

  /** Rotation invalidates outstanding grants: they would otherwise hand out the new password. */
  revokeLiveGrants(
    organizationId: string,
    testAccountId: string,
    now: Date,
  ): Promise<{ count: number }> {
    return this.prisma.credentialGrant.updateMany({
      where: { organizationId, testAccountId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
  }

  logAccess(input: LogAccessInput): Promise<{ id: string }> {
    return this.prisma.credentialAccessLog.create({
      data: {
        organizationId: input.organizationId,
        testAccountId: input.testAccountId,
        userId: input.userId,
        action: input.action,
        grantId: input.grantId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
      select: { id: true },
    });
  }

  async listAccessLog(
    filter: AccessLogFilter,
  ): Promise<{ items: CredentialAccessLogRowData[]; nextCursor: string | null; total: number }> {
    const where: Prisma.CredentialAccessLogWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.testAccountId ? { testAccountId: filter.testAccountId } : {}),
      ...(filter.userId ? { userId: filter.userId } : {}),
      ...(filter.projectId ? { testAccount: { projectId: filter.projectId } } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.credentialAccessLog.count({ where }),
      this.prisma.credentialAccessLog.findMany({
        where,
        include: accessLogInclude,
        orderBy: [{ revealedAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  /**
   * The one read that returns the ciphertext. Kept apart from every other method so that "who can
   * see a password" is answerable by looking at this method's callers.
   */
  findSecretForReveal(
    organizationId: string,
    id: string,
  ): Promise<{ id: string; username: string; secretCiphertext: string; isActive: boolean } | null> {
    return this.prisma.testAccount.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: { id: true, username: true, secretCiphertext: true, isActive: true },
    });
  }
}
