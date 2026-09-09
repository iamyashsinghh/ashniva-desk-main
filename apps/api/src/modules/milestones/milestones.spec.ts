import { computeProgress, isMilestoneOverdue } from './milestones.mapper';
import { hasCycle } from './milestone-dependencies';

describe('milestone rules', () => {
  it('computes progress from tasks first, then deliverables', () => {
    expect(
      computeProgress({ taskTotal: 4, taskDone: 1, deliverableTotal: 2, deliverableDone: 2 }),
    ).toBe(25);
    expect(
      computeProgress({ taskTotal: 0, taskDone: 0, deliverableTotal: 3, deliverableDone: 2 }),
    ).toBe(67);
    expect(
      computeProgress({ taskTotal: 0, taskDone: 0, deliverableTotal: 0, deliverableDone: 0 }),
    ).toBe(0);
  });

  it('flags overdue open milestones only', () => {
    const today = new Date('2026-09-05T00:00:00Z');
    expect(
      isMilestoneOverdue(
        { dueDate: new Date('2026-09-01T00:00:00Z'), status: 'IN_PROGRESS' },
        today,
      ),
    ).toBe(true);
    expect(
      isMilestoneOverdue({ dueDate: new Date('2026-09-01T00:00:00Z'), status: 'COMPLETED' }, today),
    ).toBe(false);
    expect(isMilestoneOverdue({ dueDate: null, status: 'IN_PROGRESS' }, today)).toBe(false);
  });

  it('detects dependency cycles', () => {
    expect(
      hasCycle([
        { milestoneId: 'a', dependsOnId: 'b' },
        { milestoneId: 'b', dependsOnId: 'c' },
      ]),
    ).toBe(false);
    expect(
      hasCycle([
        { milestoneId: 'a', dependsOnId: 'b' },
        { milestoneId: 'b', dependsOnId: 'c' },
        { milestoneId: 'c', dependsOnId: 'a' },
      ]),
    ).toBe(true);
  });
});
