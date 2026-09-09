import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PROBLEM_STATUS,
  canMoveProblem,
  type AuthenticatedUser,
  type ProblemDetail,
  type ProblemStatus,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import { ProblemsRepository } from '../problems/problems.repository';
import { ProblemsService } from '../problems/problems.service';
import type { ReviewRcaDto, SubmitRcaDto } from './dto/rca.dto';
import { RcaRepository } from './rca.repository';

/**
 * The root-cause analysis: writing it, submitting it, and reviewing it.
 *
 * The report and the problem move together. Submitting an analysis is what takes a problem from
 * "we asked for one" to "we have one", and asking for changes puts it back — otherwise the
 * problem's status would say an analysis exists when the only thing that exists is a form
 * somebody sent back.
 */
@Injectable()
export class RcaService {
  constructor(
    private readonly rca: RcaRepository,
    private readonly problems: ProblemsRepository,
    private readonly problemsService: ProblemsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Saves the ten answers, as a draft or as a submission.
   *
   * A draft moves nothing: a half-written form is not an analysis, and `problemClosureGate` does
   * not accept one. A submission moves the problem to RCA_SUBMITTED when the transition table
   * allows it, and leaves the status alone when the fix has already been assigned — the analysis
   * was still owed and is now delivered, which is not a reason to march the problem backwards.
   */
  async submit(
    actor: AuthenticatedUser,
    problemId: string,
    dto: SubmitRcaDto,
  ): Promise<ProblemDetail> {
    const problem = await this.problemsService.require(actor, problemId);
    if (problem.status === PROBLEM_STATUS.CLOSED) {
      throw new ConflictException('A closed problem takes no more analysis');
    }
    if (dto.introducedByReleaseId) {
      if (!(await this.rca.findRelease(actor.organizationId, dto.introducedByReleaseId))) {
        throw new NotFoundException('Release not found');
      }
    }
    if (dto.ownerId && !(await this.rca.findMember(actor.organizationId, dto.ownerId))) {
      throw new BadRequestException('That person is not a member of this organization');
    }
    // A submission can arrive without anybody having pressed "Request RCA" — somebody who has just
    // worked out the cause should not have to ask themselves for the analysis first.
    await this.rca.ensureDraft(actor.organizationId, problemId);

    const draft = dto.draft === true;
    const answers = {
      what: dto.what?.trim() ?? '',
      why: dto.why?.trim() ?? '',
      affectedClientsVersions: dto.affectedClientsVersions?.trim() ?? '',
      introducedBy: dto.introducedBy?.trim() ?? '',
      workaround: dto.workaround?.trim() ?? '',
      permanentFix: dto.permanentFix?.trim() ?? '',
      prevention: dto.prevention?.trim() ?? '',
      testsAdded: dto.testsAdded?.trim() ?? '',
    };
    if (!draft) {
      assertAnswered(answers);
    }

    const now = new Date();
    const saved = await this.rca.save({
      organizationId: actor.organizationId,
      problemId,
      // Not APPROVED: an approved analysis is a signed record, and editing it would rewrite what
      // somebody put their name to. A changed conclusion is a new request for changes first.
      expect: ['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED'],
      data: {
        ...answers,
        introducedByReleaseId: dto.introducedByReleaseId ?? null,
        ownerId: dto.ownerId ?? null,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        ...(draft
          ? { status: 'DRAFT' }
          : {
              status: 'SUBMITTED',
              submittedById: actor.userId,
              submittedAt: now,
              reviewNote: null,
            }),
      },
    });
    if (!saved) {
      throw new ConflictException(
        'This analysis has already been approved; ask for changes before editing it',
      );
    }

    if (!draft) {
      await this.moveProblem(
        actor,
        problemId,
        problem.status as ProblemStatus,
        PROBLEM_STATUS.RCA_SUBMITTED,
      );
      await this.auditLog.record({
        action: AUDIT_ACTION.RCA_SUBMITTED,
        entityType: AUDIT_ENTITY_TYPE.RCA_REPORT,
        entityId: problemId,
        organizationId: actor.organizationId,
        after: { problemId, introducedByReleaseId: dto.introducedByReleaseId ?? null },
      });
    }
    return this.problemsService.get(actor, problemId);
  }

  /**
   * Approves the analysis, or sends it back with what has to be different.
   *
   * Asking for changes needs a note for the same reason a rejected release does: the person about
   * to redo the work is owed the reason, and "changes requested" on its own is not one.
   */
  async review(actor: AuthenticatedUser, rcaId: string, dto: ReviewRcaDto): Promise<ProblemDetail> {
    this.problemsService.assertInternal(actor);
    const report = await this.rca.findWithProblem(actor.organizationId, rcaId);
    if (!report) {
      throw new NotFoundException('Root-cause analysis not found');
    }
    if (report.status !== 'SUBMITTED') {
      throw new ConflictException('Only a submitted analysis can be reviewed');
    }
    const approved = dto.decision === 'APPROVED';
    const note = dto.note?.trim();
    if (!approved && !note) {
      throw new BadRequestException('Say what has to be different before sending an analysis back');
    }
    const saved = await this.rca.save({
      organizationId: actor.organizationId,
      problemId: report.problemId,
      expect: ['SUBMITTED'],
      data: approved
        ? {
            status: 'APPROVED',
            approvedById: actor.userId,
            approvedAt: new Date(),
            reviewNote: note ?? null,
          }
        : { status: 'CHANGES_REQUESTED', reviewNote: note ?? null },
    });
    if (!saved) {
      throw new ConflictException('That analysis was reviewed a moment ago');
    }

    if (!approved) {
      // Back to "we asked for one": the problem no longer has an analysis, and its status has to
      // say so or the closure gate would be reading a promise instead of a fact.
      await this.moveProblem(
        actor,
        report.problemId,
        report.problem.status as ProblemStatus,
        PROBLEM_STATUS.RCA_REQUESTED,
      );
    }
    await this.auditLog.record({
      action: approved ? AUDIT_ACTION.RCA_APPROVED : AUDIT_ACTION.RCA_CHANGES_REQUESTED,
      entityType: AUDIT_ENTITY_TYPE.RCA_REPORT,
      entityId: rcaId,
      organizationId: actor.organizationId,
      after: { problemId: report.problemId, note: note ?? null },
    });
    return this.problemsService.get(actor, report.problemId);
  }

  /**
   * Moves the problem, when the transition table allows it.
   *
   * Silent when it does not, on purpose: `FIX_ASSIGNED → RCA_SUBMITTED` is a legal move and
   * `RCA_SUBMITTED → RCA_SUBMITTED` is not a move at all. Neither is a reason to refuse the
   * analysis that has just been written.
   */
  private async moveProblem(
    actor: AuthenticatedUser,
    problemId: string,
    from: ProblemStatus,
    to: ProblemStatus,
  ): Promise<void> {
    if (from === to || !canMoveProblem(from, to)) {
      return;
    }
    await this.problems.transition({
      organizationId: actor.organizationId,
      id: problemId,
      from,
      to,
    });
  }
}

/**
 * The six questions an analysis is not an analysis without, named individually.
 *
 * Checked here rather than by the DTO because the same shape carries a half-written draft, and a
 * validator cannot tell the two apart. Naming what is still blank rather than answering "invalid"
 * is the difference between a form somebody can finish and one they have to guess at.
 */
const REQUIRED_ANSWERS: ReadonlyArray<[keyof RcaAnswers, string]> = [
  ['what', 'what happened'],
  ['why', 'why it happened'],
  ['affectedClientsVersions', 'the clients and versions affected'],
  ['introducedBy', 'what introduced it'],
  ['permanentFix', 'the permanent solution'],
  ['prevention', 'the prevention'],
];

type RcaAnswers = Record<
  | 'what'
  | 'why'
  | 'affectedClientsVersions'
  | 'introducedBy'
  | 'workaround'
  | 'permanentFix'
  | 'prevention'
  | 'testsAdded',
  string
>;

/** Three characters, the same floor the other "explain why" fields in the product use. */
const MIN_ANSWER_LENGTH = 3;

function assertAnswered(answers: RcaAnswers): void {
  const missing = REQUIRED_ANSWERS.filter(([key]) => answers[key].length < MIN_ANSWER_LENGTH).map(
    ([, label]) => label,
  );
  if (missing.length > 0) {
    throw new BadRequestException(`The analysis still needs: ${missing.join(', ')}`);
  }
}
