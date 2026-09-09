import { Injectable } from '@nestjs/common';
import { NOTIFICATION_TYPE, type AuthenticatedUser } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import { NotificationRecipientsService } from '../notifications/recipients.service';

/**
 * What a passed test does to the work it was testing.
 *
 * The answer is deliberately "tells the people waiting", and nothing else. A pass used to record a
 * result and move the assignment, which meant the one person who knew the work was clear was the
 * tester who had just written it down: the developer went on chasing it and the reviewer had no
 * reason to look.
 *
 * It does not touch the task's status, for the same reason `QaFailureEffectsService` explains at
 * length — QA_PASSED and TESTING_STAGING are unreachable in the Phase 1 machine, and moving a task
 * into one here would rewrite how every task moves as a side effect of recording a result. The
 * reviewer approving the task is still what completes it, and that gate stays where it is.
 */
@Injectable()
export class QaPassEffectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcher,
    private readonly recipients: NotificationRecipientsService,
  ) {}

  /**
   * Tells the reviewer and the developer that testing is clear.
   *
   * Both, not one: the reviewer is the person who can now act, and the developer is the person
   * who has been waiting to hear. `notify` drops the actor, so a tester who is also the reviewer
   * is not told about their own result.
   */
  async onTestPassed(
    actor: AuthenticatedUser,
    assignment: { id: string; taskId: string | null; completedAt: Date },
  ): Promise<void> {
    const taskId = assignment.taskId;
    if (!taskId) {
      // A ticket or a whole release has no single developer to congratulate, and the release
      // readiness checklist is where a release-level pass shows up.
      return;
    }
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, organizationId: actor.organizationId, deletedAt: null },
      select: {
        number: true,
        title: true,
        assignedToId: true,
        reviewerId: true,
        project: { select: { code: true } },
      },
    });
    if (!task) {
      return;
    }

    const recipients = await this.recipients.members(actor.organizationId, [
      task.reviewerId,
      task.assignedToId,
    ]);
    if (recipients.length === 0) {
      return;
    }

    await this.dispatcher.notify({
      type: NOTIFICATION_TYPE.QA_PASSED,
      title: `Testing passed on ${task.project.code}-${task.number} ${task.title}`,
      body: 'The tester found no problems. It is ready for review.',
      link: `/tasks/${taskId}`,
      entityType: 'task',
      entityId: taskId,
      // Keyed on when the result was recorded, so a retried request is dropped but a genuine
      // second pass on a retest still reaches them.
      dedupeKey: `qa-passed:${assignment.id}:${assignment.completedAt.toISOString()}`,
      recipients,
      excludeUserId: actor.userId,
    });
  }
}
