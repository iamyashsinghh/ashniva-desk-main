import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  type AuthenticatedUser,
} from '@ashniva/types';

import {
  audienceForTemplate,
  customRoleKey,
  templatePermissions,
  validatePermissionGrant,
  validateTemplate,
} from './role-rules';

const actor = (roleKey: keyof typeof ROLE_KEYS): AuthenticatedUser => ({
  userId: 'u1',
  organizationId: 'o1',
  roleKey: ROLE_KEYS[roleKey],
  permissions: DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS[roleKey]],
  isServiceProvider: true,
});

describe('role rules', () => {
  it('refuses permissions the actor does not hold (no escalation)', () => {
    const violation = validatePermissionGrant(actor('PROJECT_MANAGER'), 'INTERNAL', [
      PERMISSIONS.TASK_READ,
      PERMISSIONS.COST_READ,
    ]);
    expect(violation?.code).toBe('ESCALATION');
    expect(violation?.permissions).toEqual([PERMISSIONS.COST_READ]);
  });

  it('keeps internal permissions away from client roles even for a super admin', () => {
    const violation = validatePermissionGrant(actor('SUPER_ADMIN'), 'CLIENT', [
      PERMISSIONS.TICKET_READ,
      PERMISSIONS.COMMENT_INTERNAL,
    ]);
    expect(violation?.code).toBe('CLIENT_UNSAFE');
    expect(violation?.permissions).toEqual([PERMISSIONS.COMMENT_INTERNAL]);
  });

  it('rejects unknown permission keys', () => {
    expect(validatePermissionGrant(actor('SUPER_ADMIN'), 'INTERNAL', ['task:fly'])?.code).toBe(
      'UNKNOWN_PERMISSION',
    );
  });

  it('accepts a grant inside the actor’s own permissions', () => {
    expect(
      validatePermissionGrant(actor('TEAM_LEAD'), 'INTERNAL', [PERMISSIONS.TASK_REVIEW]),
    ).toBeNull();
  });

  it('only lets a super admin start from the super admin template', () => {
    expect(validateTemplate(actor('PROJECT_MANAGER'), ROLE_KEYS.SUPER_ADMIN)?.code).toBe(
      'TEMPLATE',
    );
    expect(validateTemplate(actor('SUPER_ADMIN'), ROLE_KEYS.SUPER_ADMIN)).toBeNull();
    expect(validateTemplate(actor('SUPER_ADMIN'), 'WIZARD')?.code).toBe('TEMPLATE');
  });

  it('caps template permissions by what the actor holds', () => {
    const permissions = templatePermissions(actor('TEAM_LEAD'), ROLE_KEYS.PROJECT_MANAGER);
    expect(permissions).not.toContain(PERMISSIONS.CONTRACT_MANAGE);
    expect(permissions).toContain(PERMISSIONS.TASK_REVIEW);
  });

  it('derives the audience from the template and builds safe keys', () => {
    expect(audienceForTemplate(ROLE_KEYS.CLIENT_ADMIN)).toBe('CLIENT');
    expect(audienceForTemplate(ROLE_KEYS.DEVELOPER)).toBe('INTERNAL');
    expect(customRoleKey('Support Viewer!', 'abc123')).toBe('custom:support-viewer-abc123');
  });
});
