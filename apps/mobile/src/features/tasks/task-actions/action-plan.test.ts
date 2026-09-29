import { TASK_ACTION, type TaskActionAvailability } from '@ashniva/types';

import { planTaskActions } from './action-plan';

const none = { canEdit: false, canSendToTesting: false };
const keys = (entries: readonly { key: string }[]) => entries.map((entry) => entry.key);

describe('planTaskActions', () => {
  it('offers nothing when the API offers nothing', () => {
    expect(planTaskActions([], none)).toEqual({ primary: null, others: [] });
  });

  it('folds approve and reject into one Review, and leads with it', () => {
    const plan = planTaskActions(
      [
        { action: TASK_ACTION.APPROVE, enabled: true },
        { action: TASK_ACTION.REJECT, enabled: true },
        { action: TASK_ACTION.CANCEL, enabled: true },
      ],
      none,
    );
    expect(plan.primary?.key).toBe('review');
    expect(keys(plan.others)).toEqual([TASK_ACTION.CANCEL]);
    expect(plan.others[0]?.destructive).toBe(true);
  });

  it('keeps a refused Start on screen with its reason, and hides other refusals', () => {
    const actions: TaskActionAvailability[] = [
      { action: TASK_ACTION.START, enabled: false, reason: 'Scheduled to start later' },
      { action: TASK_ACTION.CANCEL, enabled: false, reason: 'Not yours' },
      { action: TASK_ACTION.LOG_WORK, enabled: true },
    ];
    const plan = planTaskActions(actions, none);
    expect(plan.primary).toMatchObject({
      key: TASK_ACTION.START,
      enabled: false,
      reason: 'Scheduled to start later',
    });
    expect(keys(plan.others)).toEqual([TASK_ACTION.LOG_WORK]);
  });

  it('prefers an enabled primary over a disabled one', () => {
    const plan = planTaskActions(
      [
        { action: TASK_ACTION.START, enabled: false, reason: 'Later' },
        { action: TASK_ACTION.UNBLOCK, enabled: true },
      ],
      none,
    );
    expect(plan.primary?.key).toBe(TASK_ACTION.UNBLOCK);
    expect(keys(plan.others)).toEqual([TASK_ACTION.START]);
  });

  it('offers edit only when the caller can open the form, and testing only with qa:assign', () => {
    const actions: TaskActionAvailability[] = [{ action: TASK_ACTION.EDIT, enabled: true }];
    expect(keys(planTaskActions(actions, none).others)).toEqual([]);
    const plan = planTaskActions(actions, { canEdit: true, canSendToTesting: true });
    expect(keys(plan.others)).toEqual([TASK_ACTION.EDIT, 'send-to-testing']);
  });
});
