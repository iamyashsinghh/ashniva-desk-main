import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  TEST_RESULT,
  type AuthenticatedUser,
  type TestingAssignmentDetail,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  CancelAssignmentDto,
  ClarifyAssignmentDto,
  RecordTestResultDto,
} from './dto/testing-assignment.dto';
import { QaFailureEffectsService, type AssignmentUnderTest } from './qa-failure-effects.service';
import { QaPassEffectsService } from './qa-pass-effects.service';
import { QaScopeService } from './qa-scope.service';
import { QaRepository, type AssignmentDetailRow } from './qa.repository';
import { QaService } from './qa.service';
import { assertTestingAssignmentAction } from './testing-assignment-workflow';

/**
 * Everything that moves a testing assignment: start, the pass/fail form, a question back to the
 * developer, and live verification.
 *
 * Every one of them goes through `assertTestingAssignmentAction` first, so a route cannot skip a
 * state, and every one of them is audited — a result nobody can trace is not evidence.
 */
@Injectable()
export class QaTransitionsService {
  constructor(
    private readonly assignments: QaRepository,
    private readonly qa: QaService,
    private readonly scope: QaScopeService,
    private readonly auditLog: AuditLogService,
    private readonly failures: QaFailureEffectsService,
    private readonly passes: QaPassEffectsService,
  ) {}

  async start(actor: AuthenticatedUser, id: string): Promise<TestingAssignmentDetail> {
    const row = await this.qa.requireAssignment(actor, id);
    const to = assertTestingAssignmentAction('start', row.status, subjectOf(row), actor);

    const updated = await this.assignments.update(actor.organizationId, row.id, {
      status: to,
      // Kept from the first attempt: how long testing has been open is measured from when the
      // tester first picked it up, not from the last time a question was answered.
      startedAt: row.startedAt ?? new Date(),
    });
    await this.audit(actor, AUDIT_ACTION.QA_STARTED, row, { status: to });
    return this.qa.present(actor, updated);
  }

  /**
   * The pass/fail form, and what each outcome sets in motion.
   *
   * A failure sets the assignment to FAILED, returns the task under test to its developer, and —
   * when the tester asked for a retest — opens the follow-up assignment, all in
   * `QaFailureEffectsService`. A pass tells the reviewer and the developer, in
   * `QaPassEffectsService`.
   *
   * Both run after the result is stored, and neither may throw the tester's request away: the
   * evidence they just typed is worth more than a tidy side effect.
   */
  async recordResult(
    actor: AuthenticatedUser,
    id: string,
    dto: RecordTestResultDto,
  ): Promise<TestingAssignmentDetail> {
    const row = await this.qa.requireAssignment(actor, id);
    const passed = dto.result === TEST_RESULT.PASS;
    const to = assertTestingAssignmentAction(
      passed ? 'pass' : 'fail',
      row.status,
      subjectOf(row),
      actor,
    );
    this.assertFailureIsUsable(dto, passed);
    if (dto.evidenceFileId) {
      await this.scope.assertEvidenceFile(actor.organizationId, dto.evidenceFileId);
    }

    const completedAt = new Date();
    const updated = await this.assignments.recordResult({
      organizationId: actor.organizationId,
      assignmentId: row.id,
      recordedById: actor.userId,
      status: to,
      completedAt,
      result: {
        outcome: dto.result,
        environment: dto.environment ?? row.environment,
        whatTested: dto.whatTested,
        actualResult: dto.actualResult,
        failureDescription: passed ? null : (dto.failureDescription ?? null),
        severity: passed ? null : (dto.severity ?? null),
        browserDevice: dto.browserDevice ?? null,
        commentForDeveloper: dto.commentForDeveloper ?? null,
        retestRequired: !passed && (dto.retestRequired ?? false),
        evidenceFileId: dto.evidenceFileId ?? null,
      },
    });

    await this.audit(actor, AUDIT_ACTION.QA_RESULT_RECORDED, row, {
      status: to,
      outcome: dto.result,
      severity: passed ? null : (dto.severity ?? null),
      retestRequired: !passed && (dto.retestRequired ?? false),
    });
    const subject = { ...subjectUnderTest(row), completedAt };
    if (passed) {
      await this.passes.onTestPassed(actor, subject);
    } else {
      await this.failures.onTestFailed(actor, subject, dto);
    }
    return this.qa.present(actor, updated);
  }

  async clarify(
    actor: AuthenticatedUser,
    id: string,
    dto: ClarifyAssignmentDto,
  ): Promise<TestingAssignmentDetail> {
    const row = await this.qa.requireAssignment(actor, id);
    const to = assertTestingAssignmentAction(
      'clarify',
      row.status,
      subjectOf(row),
      actor,
      dto.question,
    );

    const updated = await this.assignments.update(actor.organizationId, row.id, {
      status: to,
      clarificationQuestion: dto.question.trim(),
      // A new question invalidates the previous answer; leaving it would read as an answer to this
      // one. TODO(phase-4, later slice): the developer's reply endpoint that fills it back in.
      clarificationAnswer: null,
    });
    await this.audit(actor, AUDIT_ACTION.QA_CLARIFICATION_REQUESTED, row, { status: to });
    return this.qa.present(actor, updated);
  }

  /**
   * Withdrawing an assignment that should not have been made.
   *
   * `completedAt` is deliberately left alone: nothing was completed, and setting it would put the
   * row into the "passed today" and duration figures as though somebody had tested it.
   */
  async cancel(
    actor: AuthenticatedUser,
    id: string,
    dto: CancelAssignmentDto,
  ): Promise<TestingAssignmentDetail> {
    const row = await this.qa.requireAssignment(actor, id);
    const to = assertTestingAssignmentAction('cancel', row.status, subjectOf(row), actor);
    const reason = dto.reason?.trim() || null;

    const updated = await this.assignments.update(actor.organizationId, row.id, { status: to });
    await this.audit(actor, AUDIT_ACTION.QA_ASSIGNMENT_CANCELLED, row, { status: to, reason });
    return this.qa.present(actor, updated);
  }

  /**
   * Production sign-off. Separate from the pass/fail form because it needs `qa:verify-live`, and
   * separate from the release module because the assignment is what somebody was asked to do.
   */
  async verifyLive(actor: AuthenticatedUser, id: string): Promise<TestingAssignmentDetail> {
    const row = await this.qa.requireAssignment(actor, id);
    const to = assertTestingAssignmentAction('verifyLive', row.status, subjectOf(row), actor);

    const updated = await this.assignments.update(actor.organizationId, row.id, {
      status: to,
      completedAt: new Date(),
    });
    await this.audit(actor, AUDIT_ACTION.QA_LIVE_VERIFIED, row, {
      status: to,
      environment: row.environment,
    });
    return this.qa.present(actor, updated);
  }

  /** A failure the developer cannot act on is not a result; the form has to say what is wrong. */
  private assertFailureIsUsable(dto: RecordTestResultDto, passed: boolean): void {
    if (passed) {
      return;
    }
    if (!dto.failureDescription?.trim()) {
      throw new BadRequestException('Describe the failure so the developer can act on it');
    }
    if (!dto.severity) {
      throw new BadRequestException('Give the failure a severity');
    }
  }

  private audit(
    actor: AuthenticatedUser,
    action: string,
    row: AssignmentDetailRow,
    after: Record<string, unknown>,
  ): Promise<void> {
    return this.auditLog.record({
      action,
      entityType: AUDIT_ENTITY_TYPE.TESTING_ASSIGNMENT,
      entityId: row.id,
      organizationId: actor.organizationId,
      before: { status: row.status },
      after,
    });
  }
}

/** The slice of the row the workflow rules read. */
function subjectOf(row: AssignmentDetailRow): {
  kind: AssignmentDetailRow['kind'];
  assignedToUserId: string | null;
} {
  return { kind: row.kind, assignedToUserId: row.assignedToUserId };
}

/** The slice of the row the pass and failure effects read, carried over onto any retest. */
function subjectUnderTest(row: AssignmentDetailRow): Omit<AssignmentUnderTest, 'completedAt'> {
  return {
    id: row.id,
    projectId: row.projectId,
    environment: row.environment,
    taskId: row.taskId,
    ticketId: row.ticketId,
    releaseId: row.releaseId,
    assignedToUserId: row.assignedToUserId,
    testAccountId: row.testAccountId,
    stagingUrl: row.stagingUrl,
    whatToTest: row.whatToTest,
    acceptanceCriteria: row.acceptanceCriteria,
    browserDevice: row.browserDevice,
  };
}
