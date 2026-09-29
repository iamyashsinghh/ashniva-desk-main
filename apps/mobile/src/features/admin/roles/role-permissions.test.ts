import type { PermissionKey } from '@ashniva/types';

import { CATALOG, role } from '../shared/admin-test-data';
import {
  changeCountLabel,
  groupPermissions,
  isClientAudience,
  permissionChanges,
  roleOverline,
  toggled,
} from './role-permissions';

describe('groupPermissions', () => {
  it('groups by area in catalogue order', () => {
    expect(groupPermissions(CATALOG, false, '').map((group) => group.module)).toEqual([
      'Tickets',
      'Tasks',
    ]);
  });

  it('lists only client-safe permissions for a client role', () => {
    const groups = groupPermissions(CATALOG, true, '');
    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((entry) => entry.key)).toEqual(['ticket:read']);
  });

  it('matches the description, the key or the area', () => {
    expect(groupPermissions(CATALOG, false, 'triage')[0]?.entries).toHaveLength(1);
    expect(groupPermissions(CATALOG, false, 'task:')[0]?.module).toBe('Tasks');
    expect(groupPermissions(CATALOG, false, 'TICKETS')[0]?.entries).toHaveLength(2);
    expect(groupPermissions(CATALOG, false, 'nothing like it')).toEqual([]);
  });
});

describe('the draft', () => {
  const saved: PermissionKey[] = ['ticket:read', 'task:read'];

  it('counts what was added and removed, and nothing for a round trip', () => {
    let draft = toggled(new Set(saved), 'ticket:triage', true);
    draft = toggled(draft, 'task:read', false);
    expect(permissionChanges(saved, draft)).toEqual({
      added: ['ticket:triage'],
      removed: ['task:read'],
    });

    draft = toggled(toggled(draft, 'ticket:triage', false), 'task:read', true);
    expect(permissionChanges(saved, draft)).toEqual({ added: [], removed: [] });
  });

  it('says how many changes are unsaved', () => {
    expect(changeCountLabel(1)).toBe('1 unsaved change');
    expect(changeCountLabel(3)).toBe('3 unsaved changes');
  });
});

describe('role labels', () => {
  it('treats a role built on a client role as a client role', () => {
    expect(isClientAudience(role({ audience: 'INTERNAL', templateKey: 'CLIENT_ADMIN' }))).toBe(
      true,
    );
    expect(isClientAudience(role({ audience: 'CLIENT', templateKey: null }))).toBe(true);
    expect(isClientAudience(role())).toBe(false);
  });

  it('names where a custom role came from', () => {
    expect(roleOverline(role())).toBe('Custom role · from Support Executive');
    expect(roleOverline(role({ isSystem: true }))).toBe('System role');
  });
});
