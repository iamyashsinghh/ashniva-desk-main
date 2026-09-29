import { PRIORITY, type WorkPlanPhaseInput } from '@ashniva/types';

import { addedWorkLines, NO_SELECTION, toggleCombine } from './added-work';
import {
  assignmentChanges,
  toAssignmentsInput,
  withLevel,
  type AssignmentDraft,
} from './assignment-draft';
import { draftProblem, emptyDraft, moveItem, parseMinutes, toSavePhases } from './draft-editing';

const base: AssignmentDraft = {
  assignedToId: null,
  priority: PRIORITY.MEDIUM,
  phases: { ph1: { assignedToId: null, priority: null } },
  titles: {
    t1: { assignedToId: 'dev-a', priority: null },
    t2: { assignedToId: null, priority: null },
  },
};

describe('dirty assignment diffing', () => {
  it('is clean when nothing changed', () => {
    expect(assignmentChanges(base, base)).toBe(0);
  });

  it('counts each changed level once', () => {
    let draft = withLevel(base, 'titles', 't1', { assignedToId: 'dev-b', priority: PRIORITY.HIGH });
    draft = withLevel(draft, 'phases', 'ph1', { priority: PRIORITY.LOW });
    draft = { ...draft, assignedToId: 'dev-c' };
    expect(assignmentChanges(base, draft)).toBe(3);
  });

  it('is clean again when a pick is put back', () => {
    const changed = withLevel(base, 'titles', 't2', { assignedToId: 'dev-a' });
    const back = withLevel(changed, 'titles', 't2', { assignedToId: null });
    expect(assignmentChanges(base, back)).toBe(0);
  });

  it('sends one row per phase and topic on the plan', () => {
    const draft = withLevel(base, 'titles', 't2', { assignedToId: 'dev-b' });
    const input = toAssignmentsInput(
      {
        phases: [{ id: 'ph1', titles: [{ id: 't1' }, { id: 't2' }] }],
      } as unknown as Parameters<typeof toAssignmentsInput>[0],
      draft,
    );
    expect(input.phases).toEqual([{ id: 'ph1', assignedToId: null, priority: null }]);
    expect(input.titles).toEqual([
      { id: 't1', assignedToId: 'dev-a', priority: null },
      { id: 't2', assignedToId: 'dev-b', priority: null },
    ]);
  });
});

describe('reordering', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores a move off either end', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});

describe('the editor draft', () => {
  it('names what blocks a save', () => {
    expect(draftProblem(emptyDraft())).toMatch(/needs text/);
    expect(draftProblem([])).toMatch(/at least one phase/);
    const ready: WorkPlanPhaseInput[] = [
      {
        heading: 'Phase 1',
        titles: [{ title: 'Login', points: [{ body: 'Form', estimateMinutes: 20 }] }],
      },
    ];
    expect(draftProblem(ready)).toBeNull();
  });

  it('keeps ids and trims text on save', () => {
    expect(
      toSavePhases([
        {
          id: 'ph',
          heading: ' Phase ',
          titles: [{ title: ' T ', points: [{ id: 'p', body: ' step ', estimateMinutes: 5 }] }],
        },
      ]),
    ).toEqual([
      {
        id: 'ph',
        heading: 'Phase',
        titles: [{ title: 'T', points: [{ id: 'p', body: 'step', estimateMinutes: 5 }] }],
      },
    ]);
  });

  it('reads typed minutes as a whole number of at least one', () => {
    expect(parseMinutes('45')).toBe(45);
    expect(parseMinutes('')).toBe(1);
    expect(parseMinutes('0')).toBe(1);
    expect(parseMinutes('12m')).toBe(12);
  });
});

describe('combine selection', () => {
  it('stays inside one phase', () => {
    let selection = toggleCombine(NO_SELECTION, 'ph1', 't1');
    selection = toggleCombine(selection, 'ph1', 't2');
    expect(selection).toEqual({ phaseId: 'ph1', titleIds: ['t1', 't2'] });
    expect(toggleCombine(selection, 'ph2', 't9')).toEqual({ phaseId: 'ph2', titleIds: ['t9'] });
  });

  it('clears when the last topic is unticked', () => {
    const one = toggleCombine(NO_SELECTION, 'ph1', 't1');
    expect(toggleCombine(one, 'ph1', 't1')).toEqual(NO_SELECTION);
  });
});

describe('where added work landed', () => {
  it('describes new phases and topics', () => {
    const before = [
      {
        id: 'ph1',
        heading: 'Auth',
        titles: [{ id: 't1', title: 'Login', points: [{ id: 'p1' }] }],
      },
    ];
    const after = [
      {
        id: 'ph1',
        heading: 'Auth',
        titles: [
          { id: 't1', title: 'Login', points: [{ id: 'p1' }, { id: 'p2' }] },
          { id: 't2', title: 'OTP', points: [{ id: 'p3' }] },
        ],
      },
      {
        id: 'ph2',
        heading: 'Email',
        titles: [{ id: 't3', title: 'Reset', points: [{ id: 'p4' }] }],
      },
    ];
    expect(addedWorkLines(before, after)).toEqual([
      'Added to Auth: OTP',
      'Added to Auth · Login',
      'New phase Email: Reset',
    ]);
  });
});
