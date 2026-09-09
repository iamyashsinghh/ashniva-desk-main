import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  type AuthenticatedUser,
  type CredentialAccessLogRow,
  type CredentialGrantSummary,
  type PaginatedResponse,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import {
  DEFAULT_GRANT_TTL_MINUTES,
  type GrantCredentialDto,
  type ListAccessLogQueryDto,
} from './dto/test-account.dto';
import { QaScopeService } from './qa-scope.service';
import { QaRepository, type AssignmentDetailRow } from './qa.repository';
import { toCredentialAccessLogRow, toCredentialGrantSummary } from './test-accounts.mapper';
import { TestAccountsRepository } from './test-accounts.repository';

/**
 * Handing out timed permission to read one test password, and the log of who used it.
 *
 * Apart from `TestAccountsService` because the two answer different questions — "what logins does
 * this project have" against "who may see one, and who did" — and because the second is the half
 * an auditor reads.
 */
@Injectable()
export class CredentialGrantsService {
  constructor(
    private readonly testAccounts: TestAccountsRepository,
    private readonly assignments: QaRepository,
    private readonly scope: QaScopeService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Permission to see one password, until a stated time. Eight hours unless asked otherwise. */
  async grant(
    actor: AuthenticatedUser,
    testAccountId: string,
    dto: GrantCredentialDto,
  ): Promise<CredentialGrantSummary> {
    const account = await this.testAccounts.findById(actor.organizationId, testAccountId);
    if (!account) {
      throw new NotFoundException('Test account not found');
    }
    if (!account.isActive) {
      throw new BadRequestException('That test account has been retired');
    }
    await this.scope.assertMember(actor.organizationId, dto.grantedToUserId);
    const assignment = await this.resolveAssignment(actor, dto.assignmentId);
    const reason = reasonFor(dto, assignment, account.label);

    const grant = await this.testAccounts.createGrant(actor.organizationId, {
      testAccountId,
      grantedToUserId: dto.grantedToUserId,
      grantedById: actor.userId,
      assignmentId: assignment?.id ?? null,
      reason,
      expiresAt: new Date(Date.now() + (dto.ttlMinutes ?? DEFAULT_GRANT_TTL_MINUTES) * 60_000),
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.CREDENTIAL_GRANTED,
      entityType: AUDIT_ENTITY_TYPE.CREDENTIAL_GRANT,
      entityId: grant.id,
      organizationId: actor.organizationId,
      after: {
        testAccountId,
        grantedToUserId: dto.grantedToUserId,
        assignmentId: grant.assignmentId,
        expiresAt: grant.expiresAt,
        reason,
      },
    });

    return toCredentialGrantSummary(grant);
  }

  async accessLog(
    actor: AuthenticatedUser,
    query: ListAccessLogQueryDto,
  ): Promise<PaginatedResponse<CredentialAccessLogRow>> {
    const page = await this.testAccounts.listAccessLog({
      organizationId: actor.organizationId,
      testAccountId: query.testAccountId,
      userId: query.userId,
      projectId: query.projectId,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map(toCredentialAccessLogRow),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  /**
   * The assignment the grant is for, loaded inside the caller's tenant.
   *
   * Always loaded when an id is given, never only when it is needed for the reason: it goes into
   * a foreign key, so an id from another tenant has to fail here rather than at the database.
   */
  private async resolveAssignment(
    actor: AuthenticatedUser,
    assignmentId: string | undefined,
  ): Promise<AssignmentDetailRow | null> {
    if (!assignmentId) {
      return null;
    }
    const assignment = await this.assignments.findDetail(actor.organizationId, assignmentId);
    if (!assignment) {
      throw new NotFoundException('Testing assignment not found');
    }
    return assignment;
  }
}

/** Shown beside every reveal in the log, so it says something even when nobody typed one. */
function reasonFor(
  dto: GrantCredentialDto,
  assignment: AssignmentDetailRow | null,
  label: string,
): string {
  if (dto.reason?.trim()) {
    return dto.reason.trim();
  }
  if (assignment) {
    return `${assignment.kind} of ${assignment.project.name}`;
  }
  return `Testing with ${label}`;
}
