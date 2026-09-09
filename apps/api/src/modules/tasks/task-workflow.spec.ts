import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PERMISSIONS, TASK_ACTION, TASK_STATUS, type TaskStatus } from '@ashniva/types';

import {
  assertAction,
  explainAction,
  listActions,
  unblockTarget,
  type WorkflowTask,
} from './task-workflow';

const developer = { userId: 'dev', permissions: [PERMISSIONS.TASK_WORK, PERMISSIONS.TASK_CREATE] };
const otherDeveloper = { userId: 'dev-2', permissions: [PERMISSIONS.TASK_WORK] };
const tester = { userId: 'qa', permissions: [PERMISSIONS.TASK_WORK, PERMISSIONS.QA_RECORD_RESULT] };
const lead = {
  userId: 'lead',
  permissions: [
    PERMISSIONS.TASK_WORK,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.TASK_REVIEW,
    PERMISSIONS.TASK_CANCEL,
  ],
};

function task(status: TaskStatus, overrides: Partial<WorkflowTask> = {}): WorkflowTask {
  return {
    status,
    assignedToId: 'dev',
    createdById: 'lead',
    reviewerId: 'lead',
    testerId: 'qa',
    startedAt: null,
    ...overrides,
  };
}

describe('task workflow rules', () => {
  it('lets only the assignee start and submit', () => {
    expect(explainAction(task(TASK_STATUS.ASSIGNED), developer, TASK_ACTION.START).enabled).toBe(
      true,
    );
    expect(
      explainAction(task(TASK_STATUS.ASSIGNED), otherDeveloper, TASK_ACTION.START),
    ).toMatchObject({
      enabled: false,
      reason: 'Only the assignee can do this',
    });
    expect(
      explainAction(task(TASK_STATUS.IN_PROGRESS), developer, TASK_ACTION.SUBMIT).enabled,
    ).toBe(true);
    expect(() => assertAction(task(TASK_STATUS.IN_PROGRESS), lead, TASK_ACTION.SUBMIT)).toThrow(
      ForbiddenException,
    );
  });

  it('refuses status jumps with a 409 and a readable reason', () => {
    expect(() => assertAction(task(TASK_STATUS.ASSIGNED), developer, TASK_ACTION.SUBMIT)).toThrow(
      ConflictException,
    );
    expect(explainAction(task(TASK_STATUS.ASSIGNED), tester, TASK_ACTION.APPROVE).reason).toBe(
      'Not available while the task is assigned',
    );
  });

  it('lets the tester, reviewer or a manager review but never the assignee', () => {
    const inReview = task(TASK_STATUS.IN_REVIEW);
    expect(explainAction(inReview, tester, TASK_ACTION.APPROVE).enabled).toBe(true);
    expect(explainAction(inReview, lead, TASK_ACTION.REJECT).enabled).toBe(true);
    expect(explainAction(inReview, developer, TASK_ACTION.APPROVE)).toMatchObject({
      enabled: false,
      reason: 'You cannot review your own work',
    });
    expect(explainAction(inReview, otherDeveloper, TASK_ACTION.APPROVE).enabled).toBe(false);
  });

  it('returns an unblocked task to where it was', () => {
    expect(unblockTarget(task(TASK_STATUS.BLOCKED, { startedAt: null }))).toBe(
      TASK_STATUS.ASSIGNED,
    );
    expect(unblockTarget(task(TASK_STATUS.BLOCKED, { startedAt: new Date() }))).toBe(
      TASK_STATUS.IN_PROGRESS,
    );
    expect(() =>
      assertAction(task(TASK_STATUS.IN_PROGRESS), developer, TASK_ACTION.UNBLOCK),
    ).toThrow(ConflictException);
  });

  it('reserves cancel for task:cancel holders and reopen for managers and reviewers', () => {
    expect(
      explainAction(task(TASK_STATUS.IN_PROGRESS), developer, TASK_ACTION.CANCEL).enabled,
    ).toBe(false);
    expect(explainAction(task(TASK_STATUS.IN_PROGRESS), lead, TASK_ACTION.CANCEL).enabled).toBe(
      true,
    );
    expect(explainAction(task(TASK_STATUS.COMPLETED), developer, TASK_ACTION.REOPEN).enabled).toBe(
      false,
    );
    expect(explainAction(task(TASK_STATUS.COMPLETED), tester, TASK_ACTION.REOPEN).enabled).toBe(
      true,
    );
    expect(explainAction(task(TASK_STATUS.COMPLETED), lead, TASK_ACTION.REOPEN).enabled).toBe(true);
  });

  it('lets a creator assign their own draft even without task:assign', () => {
    const own = task(TASK_STATUS.DRAFT, { createdById: 'dev', assignedToId: null });
    expect(explainAction(own, developer, TASK_ACTION.ASSIGN).enabled).toBe(true);
    expect(explainAction(own, otherDeveloper, TASK_ACTION.ASSIGN).enabled).toBe(false);
  });

  /**
   * DEVELOPER holds `task:create`, and creating used to count as managing — so a developer could
   * raise a task and then block, unblock, reopen, edit and retarget it for the rest of its life,
   * with none of the permissions those actions are supposed to need. The creator keeps exactly
   * one thing: handing over the draft they have just written.
   */
  describe('the creator of a task is not thereby its manager', () => {
    const own = (status: TaskStatus) => task(status, { createdById: 'dev', assignedToId: 'dev-2' });

    it('cannot reassign it once it has left draft', () => {
      const check = explainAction(own(TASK_STATUS.IN_PROGRESS), developer, TASK_ACTION.ASSIGN);
      expect(check.enabled).toBe(false);
      expect(check.reason).toMatch(/only while it is a draft/i);
      // Somebody who may assign still can, which is the point of the permission.
      expect(explainAction(own(TASK_STATUS.IN_PROGRESS), lead, TASK_ACTION.ASSIGN).enabled).toBe(
        true,
      );
    });

    it('cannot block, unblock, reopen or edit somebody else’s work on it', () => {
      expect(
        explainAction(own(TASK_STATUS.IN_PROGRESS), developer, TASK_ACTION.BLOCK),
      ).toMatchObject({ enabled: false });
      expect(explainAction(own(TASK_STATUS.BLOCKED), developer, TASK_ACTION.UNBLOCK)).toMatchObject(
        { enabled: false },
      );
      expect(
        explainAction(own(TASK_STATUS.COMPLETED), developer, TASK_ACTION.REOPEN),
      ).toMatchObject({ enabled: false });
      expect(
        explainAction(own(TASK_STATUS.IN_PROGRESS), developer, TASK_ACTION.EDIT),
      ).toMatchObject({ enabled: false });
    });

    it('may still edit the draft it has not handed over', () => {
      expect(explainAction(own(TASK_STATUS.DRAFT), developer, TASK_ACTION.EDIT).enabled).toBe(true);
    });

    it('leaves the assignee’s own rights alone', () => {
      // Blocking your own work is the assignee's, not the creator's, and always was.
      const assignedToMe = task(TASK_STATUS.IN_PROGRESS, { createdById: 'lead' });
      expect(explainAction(assignedToMe, developer, TASK_ACTION.BLOCK).enabled).toBe(true);
    });
  });

  it('produces one availability entry per action', () => {
    const actions = listActions(task(TASK_STATUS.IN_PROGRESS), developer);
    expect(actions.map((entry) => entry.action).sort()).toEqual(Object.values(TASK_ACTION).sort());
    expect(actions.find((entry) => entry.action === TASK_ACTION.LOG_WORK)?.enabled).toBe(true);
  });
});

describe('a task scheduled to start later', () => {
  const ahead = () => new Date(Date.now() + 60 * 60 * 1000);
  const past = () => new Date(Date.now() - 60 * 60 * 1000);

  it('cannot be started before its time, even by the assignee', () => {
    const check = explainAction(
      task(TASK_STATUS.ASSIGNED, { scheduledStartAt: ahead() }),
      developer,
      TASK_ACTION.START,
    );
    expect(check.enabled).toBe(false);
    expect(check.reason).toMatch(/scheduled to start later/i);
  });

  it('is refused as a conflict, not as a permission problem', () => {
    // The same person may start it later, so 403 would send them looking for someone senior.
    expect(() =>
      assertAction(
        task(TASK_STATUS.ASSIGNED, { scheduledStartAt: ahead() }),
        developer,
        TASK_ACTION.START,
      ),
    ).toThrow(ConflictException);
  });

  it('can be started once the scheduled moment has passed', () => {
    expect(
      explainAction(
        task(TASK_STATUS.ASSIGNED, { scheduledStartAt: past() }),
        developer,
        TASK_ACTION.START,
      ).enabled,
    ).toBe(true);
  });

  it('does not hold up a task nobody scheduled', () => {
    expect(explainAction(task(TASK_STATUS.ASSIGNED), developer, TASK_ACTION.START).enabled).toBe(
      true,
    );
  });

  it('still allows everything that is not starting work', () => {
    // Scheduling is about when the work begins; it must not freeze the task itself.
    const scheduled = task(TASK_STATUS.ASSIGNED, { scheduledStartAt: ahead() });
    expect(explainAction(scheduled, lead, TASK_ACTION.ASSIGN).enabled).toBe(true);
    expect(explainAction(scheduled, lead, TASK_ACTION.EDIT).enabled).toBe(true);
    expect(explainAction(scheduled, lead, TASK_ACTION.CANCEL).enabled).toBe(true);
  });
});
