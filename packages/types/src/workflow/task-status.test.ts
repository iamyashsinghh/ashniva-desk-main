import {
  ALL_TASK_STATUSES,
  PHASE1_TASK_HAPPY_PATH,
  PHASE1_TASK_STATUSES,
  TASK_STATUS,
  TASK_STATUS_LABELS,
  TASK_TRANSITIONS,
  canTransitionTask,
  isTaskClosed,
} from './task-status';

describe('task workflow definition', () => {
  it('has a label and a transition entry for every status', () => {
    for (const status of ALL_TASK_STATUSES) {
      expect(TASK_STATUS_LABELS[status]).toBeTruthy();
      expect(Array.isArray(TASK_TRANSITIONS[status])).toBe(true);
    }
  });

  it('only transitions into Phase 1 statuses', () => {
    for (const status of ALL_TASK_STATUSES) {
      for (const target of TASK_TRANSITIONS[status]) {
        expect(PHASE1_TASK_STATUSES).toContain(target);
      }
    }
  });

  it('follows the MVP happy path Assigned → In progress → Review → Completed', () => {
    PHASE1_TASK_HAPPY_PATH.forEach((status, index) => {
      const next = PHASE1_TASK_HAPPY_PATH[index + 1];
      if (next) {
        expect(canTransitionTask(status, next)).toBe(true);
      }
    });
  });

  it('lets a rejected review go back to the developer and be resubmitted', () => {
    expect(canTransitionTask(TASK_STATUS.IN_REVIEW, TASK_STATUS.RETURNED_TO_DEV)).toBe(true);
    expect(canTransitionTask(TASK_STATUS.RETURNED_TO_DEV, TASK_STATUS.IN_REVIEW)).toBe(true);
  });

  it('does not allow skipping review', () => {
    expect(canTransitionTask(TASK_STATUS.IN_PROGRESS, TASK_STATUS.COMPLETED)).toBe(false);
    expect(canTransitionTask(TASK_STATUS.ASSIGNED, TASK_STATUS.COMPLETED)).toBe(false);
  });

  it('treats completed and cancelled as closed, and cancelled as terminal', () => {
    expect(isTaskClosed(TASK_STATUS.COMPLETED)).toBe(true);
    expect(isTaskClosed(TASK_STATUS.CANCELLED)).toBe(true);
    expect(isTaskClosed(TASK_STATUS.IN_REVIEW)).toBe(false);
    expect(TASK_TRANSITIONS.CANCELLED).toHaveLength(0);
    expect(canTransitionTask(TASK_STATUS.COMPLETED, TASK_STATUS.REOPENED)).toBe(true);
  });
});
