import { PRIORITY, type TaskDetail } from '@ashniva/types';

import {
  emptyTaskForm,
  parseEstimate,
  taskFormFrom,
  toCreateBody,
  toPatchBody,
  validateTaskForm,
} from './task-form-state';

const task = {
  id: 't1',
  title: 'Fix the SSO redirect',
  description: 'After sign-in it lands on /',
  project: { id: 'p1', code: 'ACM', name: 'Acme' },
  assignedTo: { id: 'u1', name: 'Ravi' },
  priority: PRIORITY.HIGH,
  category: null,
  dueDate: '2026-10-01',
  scheduledStartAt: null,
  dueAt: null,
  workAreas: ['Backend'],
  module: null,
  estimateMinutes: 90,
  reviewer: null,
  tester: { id: 'u9', name: 'Tess' },
  acceptanceCriteria: null,
  clientVisible: false,
} as unknown as TaskDetail;

describe('validateTaskForm', () => {
  it('needs a title and, on create, a project', () => {
    const errors = validateTaskForm(emptyTaskForm(null, '2026-09-28'), 'create');
    expect(Object.keys(errors).sort()).toEqual(['projectId', 'title']);
  });

  it('does not ask for a project on an edit, where it cannot change', () => {
    const values = { ...taskFormFrom(task), projectId: null };
    expect(validateTaskForm(values, 'edit')).toEqual({});
  });

  it('refuses an estimate that is not whole minutes in range', () => {
    const values = { ...emptyTaskForm('p1', '2026-09-28'), title: 'Something', estimate: '1.5' };
    expect(validateTaskForm(values, 'create').estimate).toBeDefined();
    expect(parseEstimate('')).toBeNull();
    expect(parseEstimate(' 45 ')).toBe(45);
    expect(parseEstimate('100001')).toBeNaN();
  });
});

describe('toCreateBody', () => {
  it('sends what was filled in and leaves the rest to the API defaults', () => {
    const values = {
      ...emptyTaskForm('p1', '2026-09-28'),
      title: '  New checkout  ',
      description: '   ',
      estimate: '120',
      workAreas: ['frontend'],
    };
    expect(toCreateBody(values, true)).toEqual({
      title: 'New checkout',
      projectId: 'p1',
      priority: PRIORITY.MEDIUM,
      dueDate: '2026-09-28',
      workAreas: ['Frontend'],
      estimateMinutes: 120,
      clientVisible: false,
      saveAsDraft: true,
    });
  });
});

describe('toPatchBody', () => {
  it('sends nothing when nothing changed', () => {
    const before = taskFormFrom(task);
    expect(toPatchBody(before, { ...before })).toEqual({});
  });

  it('sends only what changed, with null to clear', () => {
    const before = taskFormFrom(task);
    const after = {
      ...before,
      description: '',
      estimate: '',
      testerId: null,
      priority: PRIORITY.CRITICAL,
      module: 'Auth',
    };
    expect(toPatchBody(before, after)).toEqual({
      description: null,
      module: 'Auth',
      testerId: null,
      priority: PRIORITY.CRITICAL,
      estimateMinutes: null,
    });
  });

  it('never sends the project or the assignee', () => {
    const before = taskFormFrom(task);
    const body = toPatchBody(before, { ...before, projectId: 'p2', assignedToId: 'u2' });
    expect(body).toEqual({});
  });

  it('treats a re-typed work area as the same one', () => {
    const before = taskFormFrom(task);
    expect(toPatchBody(before, { ...before, workAreas: ['backend'] })).toEqual({});
    expect(toPatchBody(before, { ...before, workAreas: [] })).toEqual({ workAreas: [] });
  });
});
