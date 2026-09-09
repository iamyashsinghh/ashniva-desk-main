import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUDIT_ACTION, AUDIT_ENTITY_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { BlockedRequestError, SafeHttpService } from '../../infrastructure/http/safe-http.service';
import { TestAccountsRepository, type ResetHookRow } from './test-accounts.repository';

/** A hook that has not answered in this long is not going to. */
const RESET_TIMEOUT_MS = 10_000;

/**
 * `POST /test-accounts/:id/reset-data`.
 *
 * Test data goes stale — an order already placed, a coupon already redeemed — and a tester who
 * cannot get the account back to a known state stops trusting the result. `resetHookUrl` is an
 * endpoint the product under test exposes for exactly that; it was being stored and never called.
 *
 * What is sent is only which account to reset. The password is not in the row this service reads,
 * so it cannot be in the request even by accident, and nothing about the tester's session goes
 * out either.
 */
@Injectable()
export class TestAccountResetService {
  constructor(
    private readonly testAccounts: TestAccountsRepository,
    private readonly auditLog: AuditLogService,
    private readonly http: SafeHttpService,
  ) {}

  async reset(actor: AuthenticatedUser, id: string): Promise<void> {
    const account = await this.testAccounts.findResetHook(actor.organizationId, id);
    if (!account) {
      throw new NotFoundException('Test account not found');
    }
    const url = account.resetHookUrl;
    if (!url) {
      throw new ConflictException(
        'This test account has no reset endpoint. Add one to the account before resetting its data.',
      );
    }

    const outcome = await this.call(url, account, actor);
    await this.auditLog.record({
      // There is no `test_account.reset` in the shared audit actions and `packages/types` is
      // fixed for this package, so the reset is recorded as a configuration-level action on the
      // account with what it did in `after`. The entry still answers who reset which account.
      action: AUDIT_ACTION.TEST_ACCOUNT_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.TEST_ACCOUNT,
      entityId: account.id,
      organizationId: actor.organizationId,
      // The URL is recorded because "which endpoint was called" is the question a reader has; the
      // response body is not, because a product's error body can echo customer data back.
      after: { action: 'reset-data', label: account.label, hook: url, status: outcome },
    });
  }

  /**
   * Calls the hook, with a timeout of its own.
   *
   * Relying on the platform default would hold a request open for minutes against an endpoint
   * that is, by definition, somebody else's staging environment.
   */
  private async call(
    url: string,
    account: ResetHookRow,
    actor: AuthenticatedUser,
  ): Promise<number> {
    try {
      const response = await this.http.fetch(url, {
        method: 'POST',
        timeoutMs: RESET_TIMEOUT_MS,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          testAccountId: account.id,
          username: account.username,
          environment: account.environment,
          requestedByUserId: actor.userId,
          requestedAt: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        // The status, not the body: see the audit note above.
        throw new BadGatewayException(`The reset endpoint answered ${response.status}`);
      }
      return response.status;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      // A refused destination is the operator's mistake to fix, not a transient failure, so it
      // says so rather than hiding behind "could not be reached". The message names the host and
      // the rule it broke; the URL is not echoed, because it can carry a token in its query.
      if (error instanceof BlockedRequestError) {
        this.http.logRefusal(error, 'test account reset hook');
        throw new ConflictException(
          `This test account's reset endpoint points at ${error.detail}, which the server will not call. Use a publicly reachable address, or ask an administrator to allow-list the host.`,
        );
      }
      throw new BadGatewayException('The reset endpoint could not be reached');
    }
  }
}
