import { Injectable } from '@nestjs/common';
import {
  NOTIFICATION_TYPE,
  TASK_STATUS,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type AuthenticatedUser,
  type TaskStatus,
  type TestEnvironment,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';
import type { RecordTestResultDto } from './dto/testing-assignment.dto';
import { OPEN_TESTING_ASSIGNMENT_STATUSES } from './testing-assignment-workflow';

/** The slice of the assignment a failure's side effects read. */
export interface AssignmentUnderTest {
  id: string;
  projectId: string;
  environment: TestEnvironment;
  taskId: string | null;
  ticketId: string | null;
  releaseId: string | null;
  assignedToUserId: string | null;
  testAccountId: string | null;
  stagingUrl: string | null;
  whatToTest: string | null;
  acceptanceCriteria: string | null;
  browserDevice: string[];
  completedAt: Date;
}

/**
 * The retest is about the same thing the failed assignment was about, and only that.
 *
 * Null when the assignment names no subject at all. The final branch used to fall through to
 * `{ releaseId: assignment.releaseId }` unconditionally, so an assignment with all three ids null
 * would have counted every open retest in the organization that also had a null release — and then
 * opened one attached to nothing. `CreateTestingAssignmentDto` cannot produce such a row today,
 * which is exactly why it is worth refusing rather than relying on that staying true.
 */
function subjectWhere(assignment: AssignmentUnderTest) {
  if (assignment.taskId) {
    return { taskId: assignment.taskId };
  }
  if (assignment.ticketId) {
    return { ticketId: assignment.ticketId };
  }
  return assignment.releaseId ? { releaseId: assignment.releaseId } : null;
}

/**
 * What a failed test does to the work it was testing.
 *
 * Architecture Plan §13 on the pass/fail form: "Fail auto-returns the task with reason + evidence
 * and notifies the developer." This is that, and only that.
 *
 * It deliberately does not touch the task state machine. `RETURNED_TO_DEV` already exists and
 * already means "a reviewer sent this back" (`task-review.service.ts`), and IN_REVIEW is the one
 * state it is reachable from in the Phase 1 workflow. Introducing QA_FAILED or TESTING_STAGING
 * here would change how every Phase 1 task moves, which belongs to the release-pipeline package,
 * not to a side effect of recording a result.
 */
@Injectable()
export class QaFailureEffectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /**
   * Returns the task under test to its developer.
   *
   * Declines to act, silently, when:
   *  - the assignment is not about a task (a ticket or a whole release has no developer to return
   *    it to, and no single task to move);
   *  - the task has moved on since the tester picked the assignment up — cancelled, already
   *    returned, reopened, or approved by somebody else. The status is part of the update's
   *    `where`, so a task that left IN_REVIEW is not clobbered by a result recorded against the
   *    state it used to be in.
   * Neither case is an error: the result itself is recorded either way, and failing the tester's
   * request because the task moved would lose the evidence they just typed.
   */
  async onTestFailed(
    actor: AuthenticatedUser,
    assignment: AssignmentUnderTest,
    dto: RecordTestResultDto,
  ): Promise<void> {
    // Opened first, and whatever the subject is: a retest is owed on a failed ticket or release
    // just as much as on a failed task, and the tester asked for it before anything else here
    // had a chance to decline.
    if (dto.retestRequired) {
      await this.openRetest(actor, assignment);
    }

    const taskId = assignment.taskId;
    if (!taskId) {
      return;
    }

    const reason = failureNote(dto);
    const returned = await this.returnToDeveloper(actor, taskId, reason);
    if (!returned) {
      return;
    }

    if (dto.evidenceFileId) {
      await this.attachEvidence(actor.organizationId, taskId, dto.evidenceFileId);
    }
    await this.notifyDeveloper(actor, taskId, assignment, reason);
  }

  /**
   * The follow-up retest, opened from the failure that asked for one.
   *
   * A tester ticking "retest required" was previously only a flag on the result: the "retest"
   * view found it, but nothing existed to start, and `qa:assign` — which a tester does not hold —
   * was needed to file one. So the work the tester said was owed could only be picked up by
   * somebody else noticing. This opens it, carrying the payload over so the retest says what to
   * look at, and putting it on the same tester because they are the person who saw the failure.
   *
   * It never throws: the result is already recorded, and losing that to a failed follow-up would
   * be the worse trade. A duplicate is avoided by checking for an open retest first — a second
   * failure on the same work should not queue the tester twice for the same thing.
   */
  private async openRetest(
    actor: AuthenticatedUser,
    assignment: AssignmentUnderTest,
  ): Promise<void> {
    const subject = subjectWhere(assignment);
    if (!subject) {
      // An assignment that names no task, ticket or release is not something a retest can be
      // *about*. Refusing is the only safe answer: the count below would otherwise match every
      // subject-less retest in the organization, and the create would attach one to nothing.
      return;
    }
    const existing = await this.prisma.testingAssignment.count({
      where: {
        organizationId: actor.organizationId,
        deletedAt: null,
        kind: TESTING_ASSIGNMENT_KIND.RETEST,
        status: { in: [...OPEN_TESTING_ASSIGNMENT_STATUSES] },
        ...subject,
      },
    });
    if (existing > 0) {
      return;
    }
    await this.prisma.testingAssignment.create({
      data: {
        organizationId: actor.organizationId,
        projectId: assignment.projectId,
        kind: TESTING_ASSIGNMENT_KIND.RETEST,
        status: TESTING_ASSIGNMENT_STATUS.PENDING,
        environment: assignment.environment,
        taskId: assignment.taskId,
        ticketId: assignment.ticketId,
        releaseId: assignment.releaseId,
        assignedToUserId: assignment.assignedToUserId,
        // The tester who asked for it, not the person who filed the original assignment: this
        // one exists because of the result they just recorded.
        assignedById: actor.userId,
        testAccountId: assignment.testAccountId,
        stagingUrl: assignment.stagingUrl,
        whatToTest: assignment.whatToTest,
        acceptanceCriteria: assignment.acceptanceCriteria,
        browserDevice: assignment.browserDevice,
        developerNotes: 'Opened automatically from a failed test that asked for a retest.',
      },
    });
  }

  /** The status change and the history entry together, or neither. */
  private returnToDeveloper(
    actor: AuthenticatedUser,
    taskId: string,
    note: string,
  ): Promise<boolean> {
    const from: TaskStatus = TASK_STATUS.IN_REVIEW;
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: {
          id: taskId,
          organizationId: actor.organizationId,
          deletedAt: null,
          status: from,
        },
        data: { status: TASK_STATUS.RETURNED_TO_DEV },
      });
      if (claimed.count === 0) {
        return false;
      }
      await tx.taskStatusHistory.create({
        data: {
          taskId,
          fromStatus: from,
          toStatus: TASK_STATUS.RETURNED_TO_DEV,
          changedById: actor.userId,
          note,
        },
      });
      return true;
    });
  }

  /**
   * Hangs the screenshot or log off the task, so the developer finds the evidence where the work
   * is rather than having to open the QA assignment. Only a file that is not already attached to
   * a task is moved — evidence reused from somewhere else stays where it was.
   */
  private async attachEvidence(
    organizationId: string,
    taskId: string,
    evidenceFileId: string,
  ): Promise<void> {
    await this.prisma.file.updateMany({
      where: { id: evidenceFileId, organizationId, taskId: null, deletedAt: null },
      data: { taskId },
    });
  }

  private async notifyDeveloper(
    actor: AuthenticatedUser,
    taskId: string,
    assignment: { id: string; completedAt: Date },
    reason: string,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: actor.organizationId },
      select: {
        number: true,
        title: true,
        assignedToId: true,
        project: { select: { code: true } },
      },
    });
    if (!task?.assignedToId) {
      return;
    }

    await this.dispatcher.notify({
      // The existing "review returned my work" type: to the developer this is the same event, and
      // it is already in everyone's notification preferences.
      type: NOTIFICATION_TYPE.TASK_REVIEW_REJECTED,
      title: `Testing failed on ${task.project.code}-${task.number} ${task.title}`,
      body: reason,
      link: `/tasks/${taskId}`,
      entityType: 'task',
      entityId: taskId,
      // Keyed on when this failure was recorded, so a retried request is dropped but a genuine
      // second failure on the same assignment still reaches the developer.
      dedupeKey: `qa-failed:${assignment.id}:${assignment.completedAt.toISOString()}`,
      recipients: await this.recipients.member(actor.organizationId, task.assignedToId),
      excludeUserId: actor.userId,
    });
  }
}

/** The reason, as the developer reads it on the task history and in the notification. */
function failureNote(dto: RecordTestResultDto): string {
  const description = dto.failureDescription?.trim() ?? 'Testing failed';
  const severity = dto.severity ? `${dto.severity}: ` : '';
  return `${severity}${description}`;
}
