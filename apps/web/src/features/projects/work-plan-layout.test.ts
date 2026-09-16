import { describe, expect, it } from 'vitest';

import {
  canAcceptDrop,
  describeAddedWork,
  moveWorkPlanDraft,
  type WorkPlanDragItem,
} from './work-plan-layout';

const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const T1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const T2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const S1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const S2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const S3 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function plan() {
  return [
    {
      id: P1,
      heading: 'Auth',
      titles: [
        {
          id: T1,
          title: 'Login',
          points: [
            { id: S1, body: 'OTP screen', estimateMinutes: 45 },
            { id: S2, body: 'Session timeout', estimateMinutes: 30 },
          ],
        },
      ],
    },
    {
      id: P2,
      heading: 'Billing',
      titles: [
        {
          id: T2,
          title: 'UPI',
          points: [{ id: S3, body: 'Collect UPI', estimateMinutes: 60 }],
        },
        {
          id: T3,
          title: 'Cards',
          points: [
            { id: '99999999-9999-4999-8999-999999999999', body: 'Card form', estimateMinutes: 20 },
          ],
        },
      ],
    },
  ];
}

describe('moveWorkPlanDraft', () => {
  it('reorders phases', () => {
    const moved = moveWorkPlanDraft(
      plan(),
      { kind: 'phase', phaseId: P2 },
      { kind: 'phase', phaseId: P1, at: 'before' },
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.phases.map((phase) => phase.heading)).toEqual(['Billing', 'Auth']);
    }
  });

  it('moves a topic into another phase', () => {
    const moved = moveWorkPlanDraft(
      plan(),
      { kind: 'title', phaseId: P2, titleId: T3 },
      { kind: 'phase', phaseId: P1, at: 'inside' },
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.phases[0]?.titles.map((title) => title.title)).toEqual(['Login', 'Cards']);
      expect(moved.phases[1]?.titles.map((title) => title.title)).toEqual(['UPI']);
    }
  });

  it('moves a step onto another topic and drops an emptied topic', () => {
    const moved = moveWorkPlanDraft(
      plan(),
      { kind: 'point', phaseId: P2, titleId: T2, pointId: S3 },
      { kind: 'title', phaseId: P1, titleId: T1, at: 'inside' },
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.phases[0]?.titles[0]?.points.map((point) => point.body)).toEqual([
        'OTP screen',
        'Session timeout',
        'Collect UPI',
      ]);
      expect(moved.phases[1]?.titles.map((title) => title.title)).toEqual(['Cards']);
    }
  });

  it('reorders steps inside a topic', () => {
    const moved = moveWorkPlanDraft(
      plan(),
      { kind: 'point', phaseId: P1, titleId: T1, pointId: S2 },
      { kind: 'point', phaseId: P1, titleId: T1, pointId: S1, at: 'before' },
    );
    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.phases[0]?.titles[0]?.points.map((point) => point.body)).toEqual([
        'Session timeout',
        'OTP screen',
      ]);
    }
  });
});

describe('canAcceptDrop', () => {
  const title: WorkPlanDragItem = { kind: 'title', phaseId: P1, titleId: T1 };
  it('lets a topic land on another phase, not inside itself', () => {
    expect(canAcceptDrop(title, { kind: 'phase', phaseId: P2, at: 'inside' })).toBe(true);
    expect(canAcceptDrop(title, { kind: 'phase', phaseId: P1, at: 'inside' })).toBe(false);
    expect(canAcceptDrop(title, { kind: 'title', phaseId: P2, titleId: T2, at: 'before' })).toBe(
      true,
    );
  });
});

describe('describeAddedWork', () => {
  it('names a new phase and its topics', () => {
    const placed = describeAddedWork(plan().slice(0, 1), plan());
    expect(placed.phaseIds).toEqual([P2]);
    expect(placed.lines[0]).toBe('New phase Billing: UPI, Cards');
    expect(placed.firstId).toBe(P2);
  });

  it('names topics added to an existing phase', () => {
    const before = plan();
    const after = plan();
    after[0]?.titles.push({
      id: 'abababab-abab-4aba-8aba-abababababab',
      title: 'OTP',
      points: [
        {
          id: 'cdcdcdcd-cdcd-4cdc-8cdc-cdcdcdcdcdcd',
          body: 'OTP screen',
          estimateMinutes: 45,
        },
      ],
    });
    const placed = describeAddedWork(before, after);
    expect(placed.phaseIds).toEqual([]);
    expect(placed.lines).toEqual(['Added to Auth: OTP']);
    expect(placed.titleIds).toHaveLength(1);
  });
});
