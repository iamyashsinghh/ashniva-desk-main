import { PERMISSIONS, PRIORITY, ROLE_KEYS, type PermissionKey } from '@ashniva/types';

import {
  emptyInternWork,
  internWorkCopy,
  isInternUser,
  mayAssignInternWork,
  toInternTaskBody,
  validateInternWork,
} from './intern-work';

const holds =
  (...permissions: PermissionKey[]) =>
  (permission: PermissionKey) =>
    permissions.includes(permission);

describe('who may assign intern work', () => {
  it('is a manager role holding task:assign', () => {
    for (const roleKey of [ROLE_KEYS.SUPER_ADMIN, ROLE_KEYS.PROJECT_MANAGER, ROLE_KEYS.TEAM_LEAD]) {
      expect(mayAssignInternWork({ roleKey }, holds(PERMISSIONS.TASK_ASSIGN))).toBe(true);
    }
  });

  it('is nobody without the permission, even a manager', () => {
    expect(mayAssignInternWork({ roleKey: ROLE_KEYS.PROJECT_MANAGER }, holds())).toBe(false);
  });

  it('is nobody outside the manager roles, even with the permission', () => {
    for (const roleKey of [ROLE_KEYS.DEVELOPER, ROLE_KEYS.INTERN, ROLE_KEYS.TESTER]) {
      expect(mayAssignInternWork({ roleKey }, holds(PERMISSIONS.TASK_ASSIGN))).toBe(false);
    }
  });

  it('is nobody before the session is known', () => {
    expect(mayAssignInternWork(null, holds(PERMISSIONS.TASK_ASSIGN))).toBe(false);
  });
});

describe('what the board says', () => {
  it('speaks to the intern about their own work', () => {
    expect(isInternUser({ roleKey: ROLE_KEYS.INTERN })).toBe(true);
    expect(internWorkCopy(true).emptyTitle).toBe('No intern work yet');
  });

  it('speaks to everybody else about handing it out', () => {
    expect(isInternUser({ roleKey: ROLE_KEYS.TEAM_LEAD })).toBe(false);
    expect(internWorkCopy(false).emptyTitle).toBe('No assignments yet');
  });
});

describe('the assignment form', () => {
  it('starts due today at medium priority', () => {
    expect(emptyInternWork('2026-09-28')).toMatchObject({
      dueDate: '2026-09-28',
      priority: PRIORITY.MEDIUM,
      projectId: null,
    });
  });

  it('asks for a clear title and an intern', () => {
    expect(validateInternWork({ ...emptyInternWork('2026-09-28'), title: ' ab ' })).toEqual({
      title: 'Give the work a clear title',
      assignedToId: 'Choose an intern',
    });
  });

  it('sends learning work that is never client-visible and leaves out what is blank', () => {
    const body = toInternTaskBody({
      ...emptyInternWork('2026-09-28'),
      title: '  Build a todo app  ',
      description: '   ',
      assignedToId: 'intern-1',
      dueDate: null,
    });
    expect(body).toEqual({
      title: 'Build a todo app',
      assignedToId: 'intern-1',
      priority: PRIORITY.MEDIUM,
      isInternTask: true,
      clientVisible: false,
    });
  });

  it('carries the project, brief and due date when they are set', () => {
    const body = toInternTaskBody({
      ...emptyInternWork('2026-09-28'),
      title: 'Read the API guide',
      description: ' Chapters 1-3 ',
      projectId: 'p1',
      assignedToId: 'intern-1',
    });
    expect(body).toMatchObject({
      description: 'Chapters 1-3',
      projectId: 'p1',
      dueDate: '2026-09-28',
    });
  });
});
