import {
  TASK_STATUS,
  TEST_ENVIRONMENT,
  TEST_RESULT,
  TEST_SEVERITY,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type AuthenticatedUser,
} from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import type { NotificationDispatcher } from '../notifications/notification-dispatcher.service';
import type { NotificationRecipientsService } from '../notifications/recipients.service';
import type { RecordTestResultDto } from './dto/testing-assignment.dto';
import { QaFailureEffectsService, type AssignmentUnderTest } from './qa-failure-effects.service';

const ORG = 'org-1';
const TESTER = 'user-tester';
const DEVELOPER = 'user-developer';
const TASK = 'task-1';

const actor = { userId: TESTER, organizationId: ORG } as AuthenticatedUser;

const assignment: AssignmentUnderTest = {
  id: 'assignment-1',
  projectId: 'project-1',
  environment: TEST_ENVIRONMENT.STAGING,
  taskId: TASK,
  ticketId: null,
  releaseId: null,
  assignedToUserId: TESTER,
  testAccountId: null,
  stagingUrl: 'https://staging.example.com',
  whatToTest: 'Checkout with a saved card',
  acceptanceCriteria: null,
  browserDevice: ['Chrome'],
  completedAt: new Date('2026-09-07T10:00:00Z'),
};

function failure(over: Partial<RecordTestResultDto> = {}): RecordTestResultDto {
  return {
    result: TEST_RESULT.FAIL,
    whatTested: 'Checkout with a saved card',
    actualResult: 'The order total was wrong',
    failureDescription: 'Tax is added twice on the summary line',
    severity: TEST_SEVERITY.HIGH,
    ...over,
  } as RecordTestResultDto;
}

function build(
  overrides: { returned?: number; assignedToId?: string | null; openRetests?: number } = {},
) {
  const tx = {
    task: { updateMany: jest.fn(async () => ({ count: overrides.returned ?? 1 })) },
    taskStatusHistory: { create: jest.fn(async () => ({ id: 'history-1' })) },
  };
  const prisma = {
    $transaction: jest.fn(async (run: (client: typeof tx) => Promise<boolean>) => run(tx)),
    task: {
      findFirst: jest.fn(async () => ({
        number: 42,
        title: 'Checkout totals',
        assignedToId: overrides.assignedToId === undefined ? DEVELOPER : overrides.assignedToId,
        project: { code: 'ACM' },
      })),
    },
    file: { updateMany: jest.fn(async () => ({ count: 1 })) },
    testingAssignment: {
      count: jest.fn(async () => overrides.openRetests ?? 0),
      create: jest.fn(async () => ({ id: 'retest-1' })),
    },
  };
  const dispatcher = { notify: jest.fn(async () => ({ created: 1 })) };
  const recipients = {
    member: jest.fn(async () => [{ userId: DEVELOPER, organizationId: ORG }]),
  };

  const service = new QaFailureEffectsService(
    prisma as unknown as PrismaService,
    dispatcher as unknown as NotificationDispatcher,
    recipients as unknown as NotificationRecipientsService,
  );
  return { service, prisma, tx, dispatcher, recipients };
}

describe('QaFailureEffectsService', () => {
  it('returns the task to its developer and records why', async () => {
    const { service, tx, dispatcher } = build();
    await service.onTestFailed(actor, assignment, failure());

    expect(tx.task.updateMany).toHaveBeenCalledWith({
      // The status is in the `where`, not checked beforehand: a task that moved on between the
      // tester opening the form and submitting it is left alone.
      where: { id: TASK, organizationId: ORG, deletedAt: null, status: TASK_STATUS.IN_REVIEW },
      data: { status: TASK_STATUS.RETURNED_TO_DEV },
    });
    expect(tx.taskStatusHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskId: TASK,
        fromStatus: TASK_STATUS.IN_REVIEW,
        toStatus: TASK_STATUS.RETURNED_TO_DEV,
        changedById: TESTER,
        note: 'HIGH: Tax is added twice on the summary line',
      }),
    });
    expect(dispatcher.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Testing failed on ACM-42 Checkout totals',
        body: 'HIGH: Tax is added twice on the summary line',
        link: `/tasks/${TASK}`,
        excludeUserId: TESTER,
      }),
    );
  });

  it('does nothing at all when the assignment is not about a task', async () => {
    const { service, prisma, dispatcher } = build();
    await service.onTestFailed(actor, { ...assignment, taskId: null }, failure());
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(dispatcher.notify).not.toHaveBeenCalled();
  });

  it('declines silently when the task has already moved on', async () => {
    // A reviewer cancelled it, or somebody else returned it first. The result is still recorded;
    // only the side effect steps back.
    const { service, tx, dispatcher } = build({ returned: 0 });
    await service.onTestFailed(actor, assignment, failure());
    expect(tx.taskStatusHistory.create).not.toHaveBeenCalled();
    expect(dispatcher.notify).not.toHaveBeenCalled();
  });

  it('attaches the evidence to the task, without stealing a file from another one', async () => {
    const { service, prisma } = build();
    await service.onTestFailed(actor, assignment, failure({ evidenceFileId: 'file-1' }));
    expect(prisma.file.updateMany).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: ORG, taskId: null, deletedAt: null },
      data: { taskId: TASK },
    });
  });

  it('has nobody to tell when the task is unassigned', async () => {
    const { service, dispatcher } = build({ assignedToId: null });
    await service.onTestFailed(actor, assignment, failure());
    expect(dispatcher.notify).not.toHaveBeenCalled();
  });

  describe('the retest the tester asked for', () => {
    it('is opened on the same tester, carrying what to look at', async () => {
      const { service, prisma } = build();
      await service.onTestFailed(actor, assignment, failure({ retestRequired: true }));

      expect(prisma.testingAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: ORG,
          projectId: 'project-1',
          kind: TESTING_ASSIGNMENT_KIND.RETEST,
          status: TESTING_ASSIGNMENT_STATUS.PENDING,
          taskId: TASK,
          ticketId: null,
          releaseId: null,
          // The tester keeps it: a tester does not hold `qa:assign`, so anything else would put
          // the follow-up somewhere they cannot open.
          assignedToUserId: TESTER,
          assignedById: TESTER,
          stagingUrl: 'https://staging.example.com',
          whatToTest: 'Checkout with a saved card',
        }),
      });
    });

    it('is not opened when the tester did not ask for one', async () => {
      const { service, prisma } = build();
      await service.onTestFailed(actor, assignment, failure());
      expect(prisma.testingAssignment.create).not.toHaveBeenCalled();
    });

    it('is not opened twice when a second failure lands on the same work', async () => {
      const { service, prisma } = build({ openRetests: 1 });
      await service.onTestFailed(actor, assignment, failure({ retestRequired: true }));
      expect(prisma.testingAssignment.create).not.toHaveBeenCalled();
    });

    it('is opened for a ticket or a release too, which have no task to return', async () => {
      const { service, prisma } = build();
      await service.onTestFailed(
        actor,
        { ...assignment, taskId: null, ticketId: 'ticket-1' },
        failure({ retestRequired: true }),
      );
      expect(prisma.testingAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ticketId: 'ticket-1', taskId: null }),
      });
      // …and the task-side effects still stand back, because there is no task.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
