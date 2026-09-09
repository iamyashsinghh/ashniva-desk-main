import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  PROBLEM_STATUS,
  PROBLEM_STATUS_LABELS,
  canMoveProblem,
  type AuthenticatedUser,
  type ProblemDetail,
  type ProblemStatus,
} from '@ashniva/types';

import { AuditLogService } from '../audit-logs/audit-log.service';
import type {
  AskDeveloperDto,
  AssignFixDto,
  CloseProblemDto,
  PreventiveTestDto,
  RequestRcaDto,
} from './dto/problem.dto';
import { problemClosureFor } from './problem-closure';
import { ProblemsService } from './problems.service';
import { ProblemsRepository, type ProblemDetailRow } from './problems.repository';

/**
 * The workflow actions on a problem: asking for an analysis, asking the developer, naming the
 * permanent fix, recording the test that stops it coming back, and closing it.
 *
 * Every one of them audits, because between them they are the record of how an organization
 * answered a fault that hit several of its clients.
 */
@Injectable()
export class ProblemActionsService {
  constructor(
    private readonly problems: ProblemsRepository,
    private readonly service: ProblemsService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * Asks for a root-cause analysis, and creates the empty form to fill in.
   *
   * The draft is created here rather than when somebody first opens the RCA screen, so that "an
   * analysis was asked for" is a fact in the database rather than a thing that happened to be
   * true when a page loaded.
   */
  async requestRca(
    actor: AuthenticatedUser,
    id: string,
    dto: RequestRcaDto,
  ): Promise<ProblemDetail> {
    const problem = await this.service.require(actor, id);
    const from = problem.status as ProblemStatus;
    this.assertMove(from, PROBLEM_STATUS.RCA_REQUESTED);
    if (dto.ownerId && !(await this.problems.findMember(actor.organizationId, dto.ownerId))) {
      throw new BadRequestException('That person is not a member of this organization');
    }
    const moved = await this.problems.transition({
      organizationId: actor.organizationId,
      id,
      from,
      to: PROBLEM_STATUS.RCA_REQUESTED,
      data: {
        ...(dto.dueDate ? { rcaDueDate: new Date(dto.dueDate) } : {}),
        ...(dto.ownerId ? { ownerId: dto.ownerId } : {}),
      },
    });
    if (!moved) {
      throw new ConflictException('Somebody else moved this problem; reload and try again');
    }
    await this.problems.ensureRcaDraft(actor.organizationId, id);
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_RCA_REQUESTED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: id,
      organizationId: actor.organizationId,
      after: {
        from,
        dueDate: dto.dueDate ?? null,
        ownerId: dto.ownerId ?? null,
        note: dto.note ?? null,
      },
    });
    return this.service.get(actor, id);
  }

  /**
   * A question to whoever owns the problem, or the answer to one.
   *
   * One endpoint, because it is one conversation: the approved screen shows a single thread on the
   * problem, and putting the answer behind a second route would split half of it away.
   */
  async askDeveloper(
    actor: AuthenticatedUser,
    id: string,
    dto: AskDeveloperDto,
  ): Promise<ProblemDetail> {
    await this.service.require(actor, id);
    if (dto.questionId) {
      const answer = dto.answer?.trim();
      if (!answer) {
        throw new BadRequestException('Answering a question needs an answer');
      }
      const answered = await this.problems.answerQuestion({
        organizationId: actor.organizationId,
        problemId: id,
        questionId: dto.questionId,
        answer,
        answeredById: actor.userId,
      });
      if (!answered) {
        throw new NotFoundException('That question is not on this problem');
      }
    } else {
      const body = dto.body?.trim();
      if (!body) {
        throw new BadRequestException('Give either a question, or a questionId and an answer');
      }
      await this.problems.createQuestion({
        organizationId: actor.organizationId,
        problemId: id,
        body,
        askedById: actor.userId,
      });
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_DEVELOPER_ASKED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: id,
      organizationId: actor.organizationId,
      after: { answered: Boolean(dto.questionId) },
    });
    return this.service.get(actor, id);
  }

  /**
   * Names the task that carries the permanent fix.
   *
   * A link, never a second copy of the work: the fix is tracked on the board like everything else,
   * and `problemClosureGate` reads that task's status rather than a tick somebody set here.
   */
  async assignFix(actor: AuthenticatedUser, id: string, dto: AssignFixDto): Promise<ProblemDetail> {
    const problem = await this.service.require(actor, id);
    const from = problem.status as ProblemStatus;
    this.assertMove(from, PROBLEM_STATUS.FIX_ASSIGNED);
    if (!(await this.problems.findTask(actor.organizationId, dto.taskId))) {
      throw new NotFoundException('Task not found');
    }
    const moved = await this.problems.transition({
      organizationId: actor.organizationId,
      id,
      from,
      to: PROBLEM_STATUS.FIX_ASSIGNED,
      data: { fixTaskId: dto.taskId },
    });
    if (!moved) {
      throw new ConflictException('Somebody else moved this problem; reload and try again');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_FIX_ASSIGNED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: id,
      organizationId: actor.organizationId,
      after: { from, taskId: dto.taskId },
    });
    return this.service.get(actor, id);
  }

  /**
   * Records the test that stops the fault coming back.
   *
   * Its own permission — `problem:add-preventive-test` — because the approved matrix gives QA
   * exactly this one write on a problem and nothing else. It changes no status: a preventive test
   * is checklisted at closure, and it does not block.
   */
  async addPreventiveTest(
    actor: AuthenticatedUser,
    id: string,
    dto: PreventiveTestDto,
  ): Promise<ProblemDetail> {
    await this.service.require(actor, id);
    if (!actor.permissions.includes(PERMISSIONS.PROBLEM_ADD_PREVENTIVE_TEST)) {
      throw new ForbiddenException('Recording a preventive test needs problem:add-preventive-test');
    }
    const text = dto.preventiveTest?.trim();
    if (!text && !dto.taskId) {
      throw new BadRequestException('Describe the preventive test, or name the task adding it');
    }
    if (dto.taskId && !(await this.problems.findTask(actor.organizationId, dto.taskId))) {
      throw new NotFoundException('Task not found');
    }
    await this.problems.update(actor.organizationId, id, {
      ...(text ? { preventiveTest: text } : {}),
      ...(dto.taskId ? { preventiveTestTaskId: dto.taskId } : {}),
    });
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_PREVENTIVE_TEST_ADDED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: id,
      organizationId: actor.organizationId,
      after: { preventiveTest: text ?? null, taskId: dto.taskId ?? null },
    });
    return this.service.get(actor, id);
  }

  /**
   * Closes the problem, if the gate lets it.
   *
   * The refusal quotes the gate's own sentences, which are the same sentences printed under the
   * disabled button on the screen — the reason the gate returns prose rather than flags.
   *
   * A problem whose fix has just been verified is walked through `FIX_RELEASED` on the way out.
   * That status is exactly what "the fix is out" means, and recording it is more honest than
   * teaching the transition table a shortcut from `FIX_ASSIGNED` straight to closed.
   */
  async close(actor: AuthenticatedUser, id: string, dto: CloseProblemDto): Promise<ProblemDetail> {
    const problem = await this.service.require(actor, id);
    const from = problem.status as ProblemStatus;
    if (from === PROBLEM_STATUS.CLOSED) {
      throw new ConflictException('This problem is already closed');
    }
    const closure = problemClosureFor(problem);
    if (!closure.allowed) {
      throw new ConflictException(closure.blockers.join(' '));
    }
    const start = await this.releaseFix(actor, problem, from);
    const moved = await this.problems.transition({
      organizationId: actor.organizationId,
      id,
      from: start,
      to: PROBLEM_STATUS.CLOSED,
      data: { closedAt: new Date(), closedById: actor.userId },
    });
    if (!moved) {
      throw new ConflictException('Somebody else moved this problem; reload and try again');
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_CLOSED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: id,
      organizationId: actor.organizationId,
      after: { from, note: dto.note ?? null, warnings: closure.warnings },
    });
    return this.service.get(actor, id);
  }

  /** Records that the verified fix actually went out, and answers with the status to close from. */
  private async releaseFix(
    actor: AuthenticatedUser,
    problem: ProblemDetailRow,
    from: ProblemStatus,
  ): Promise<ProblemStatus> {
    if (from !== PROBLEM_STATUS.FIX_ASSIGNED) {
      return from;
    }
    const released = await this.problems.transition({
      organizationId: actor.organizationId,
      id: problem.id,
      from,
      to: PROBLEM_STATUS.FIX_RELEASED,
    });
    if (!released) {
      throw new ConflictException('Somebody else moved this problem; reload and try again');
    }
    return PROBLEM_STATUS.FIX_RELEASED;
  }

  private assertMove(from: ProblemStatus, to: ProblemStatus): void {
    if (!canMoveProblem(from, to)) {
      throw new ConflictException(
        `A problem that is ${PROBLEM_STATUS_LABELS[from]} cannot become ${PROBLEM_STATUS_LABELS[to]}`,
      );
    }
  }
}
