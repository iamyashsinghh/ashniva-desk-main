import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  TESTER_VIEW,
  TEST_ENVIRONMENT,
  TESTING_ASSIGNMENT_STATUS,
  type AuthenticatedUser,
  type TestAccountSummary,
  type TesterQueue,
  type TestingAssignmentDetail,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { TaskVisibilityService } from '../tasks/task-visibility.service';
import type { CreateTestingAssignmentDto, TesterQueueQueryDto } from './dto/testing-assignment.dto';
import { QaScopeService } from './qa-scope.service';
import { toAssignmentDetail, toAssignmentSummary } from './qa.mapper';
import { QaRepository, type AssignmentDetailRow } from './qa.repository';
import { toTestAccountSummary } from './test-accounts.mapper';
import { TestAccountsRepository } from './test-accounts.repository';

const DEFAULT_QUEUE_SIZE = 50;

/**
 * Reads and creation for testing assignments. Status moves live in `QaTransitionsService`, and the
 * rules behind them in `testing-assignment-workflow.ts`.
 */
@Injectable()
export class QaService {
  constructor(
    private readonly assignments: QaRepository,
    private readonly testAccounts: TestAccountsRepository,
    private readonly scope: QaScopeService,
    private readonly auditLog: AuditLogService,
    private readonly visibility: TaskVisibilityService,
  ) {}

  /** The nine views plus the list behind the one selected, in a single request. */
  async queue(actor: AuthenticatedUser, query: TesterQueueQueryDto): Promise<TesterQueue> {
    const now = new Date();
    const viewScope = {
      organizationId: actor.organizationId,
      userId: actor.userId,
      now,
      projectId: query.projectId,
      // On the counts and the list alike: a card that counts what its own list will not show is
      // the disagreement `tester-views.ts` exists to prevent.
      visibility: await this.visibility.testingAssignmentWhere(actor),
    };
    const [counts, rows] = await Promise.all([
      this.assignments.countViews(viewScope),
      this.assignments.listForView(
        query.view ?? TESTER_VIEW.MINE,
        viewScope,
        query.limit ?? DEFAULT_QUEUE_SIZE,
      ),
    ]);
    return { counts, queue: rows.map((row) => toAssignmentSummary(row, now)) };
  }

  async detail(actor: AuthenticatedUser, id: string): Promise<TestingAssignmentDetail> {
    return this.present(actor, await this.requireAssignment(actor, id));
  }

  /** Tenant-scoped load used by every write path, so no route reads another tenant's row. */
  async requireAssignment(actor: AuthenticatedUser, id: string): Promise<AssignmentDetailRow> {
    const row = await this.assignments.findDetail(
      actor.organizationId,
      id,
      await this.visibility.testingAssignmentWhere(actor),
    );
    if (!row) {
      throw new NotFoundException('Testing assignment not found');
    }
    return row;
  }

  /**
   * The detail response. The attached login is read separately and `hasActiveGrant` per caller:
   * whether it can be revealed depends on who is asking, never on the assignment.
   */
  async present(
    actor: AuthenticatedUser,
    row: AssignmentDetailRow,
  ): Promise<TestingAssignmentDetail> {
    const now = new Date();
    return toAssignmentDetail(row, { testAccount: await this.attachedAccount(actor, row), now });
  }

  private async attachedAccount(
    actor: AuthenticatedUser,
    row: AssignmentDetailRow,
  ): Promise<TestAccountSummary | null> {
    if (!row.testAccount) {
      return null;
    }
    const granted = await this.testAccounts.accountIdsWithLiveGrant(
      actor.organizationId,
      actor.userId,
      [row.testAccount.id],
      new Date(),
    );
    return toTestAccountSummary(row.testAccount, granted.has(row.testAccount.id));
  }

  async create(
    actor: AuthenticatedUser,
    dto: CreateTestingAssignmentDto,
  ): Promise<TestingAssignmentDetail> {
    await this.scope.assertProject(actor.organizationId, dto.projectId);
    await this.assertSubject(actor, dto);
    if (dto.assignedToUserId) {
      await this.scope.assertMember(actor.organizationId, dto.assignedToUserId);
    }
    if (dto.testAccountId) {
      await this.assertTestAccountInProject(actor, dto.testAccountId, dto.projectId);
    }

    const row = await this.assignments.create(actor.organizationId, {
      projectId: dto.projectId,
      kind: dto.kind,
      status: TESTING_ASSIGNMENT_STATUS.PENDING,
      environment: dto.environment ?? TEST_ENVIRONMENT.STAGING,
      taskId: dto.taskId ?? null,
      ticketId: dto.ticketId ?? null,
      releaseId: dto.releaseId ?? null,
      assignedToUserId: dto.assignedToUserId ?? null,
      assignedById: actor.userId,
      testAccountId: dto.testAccountId ?? null,
      stagingUrl: dto.stagingUrl ?? null,
      whatDeveloped: dto.whatDeveloped ?? null,
      whatToTest: dto.whatToTest ?? null,
      acceptanceCriteria: dto.acceptanceCriteria ?? null,
      developerNotes: dto.developerNotes ?? null,
      browserDevice: dto.browserDevice ?? [],
      checksStatus: dto.checksStatus ?? null,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.QA_ASSIGNED,
      entityType: AUDIT_ENTITY_TYPE.TESTING_ASSIGNMENT,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: {
        kind: row.kind,
        environment: row.environment,
        projectId: row.projectId,
        assignedToUserId: row.assignedToUserId,
        dueAt: row.dueAt,
      },
    });

    return this.present(actor, row);
  }

  /**
   * Exactly one subject, and it has to be ours.
   *
   * The schema says "exactly one of these is set; the check is in the service" — this is that
   * check. Two subjects would make `subjectLabel` a guess and the retest queue ambiguous.
   */
  private async assertSubject(
    actor: AuthenticatedUser,
    dto: CreateTestingAssignmentDto,
  ): Promise<void> {
    const subjects = [dto.taskId, dto.ticketId, dto.releaseId].filter(Boolean);
    if (subjects.length !== 1) {
      throw new BadRequestException('Give exactly one of taskId, ticketId or releaseId');
    }
    const exists = await this.assignments.subjectExists(actor.organizationId, dto.projectId, {
      taskId: dto.taskId,
      ticketId: dto.ticketId,
      releaseId: dto.releaseId,
    });
    if (!exists) {
      throw new NotFoundException(
        'The task, ticket or release being tested was not found on this project',
      );
    }
  }

  private async assertTestAccountInProject(
    actor: AuthenticatedUser,
    testAccountId: string,
    projectId: string,
  ): Promise<void> {
    const account = await this.testAccounts.findById(actor.organizationId, testAccountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundException('Test account not found for this project');
    }
    if (!account.isActive) {
      throw new BadRequestException('That test account has been retired');
    }
  }
}
