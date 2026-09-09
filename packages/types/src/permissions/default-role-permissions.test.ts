import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions';
import { ALL_PERMISSION_KEYS, CLIENT_SAFE_PERMISSIONS, PERMISSIONS } from './permission-keys';
import { ALL_ROLE_KEYS, CLIENT_ROLE_KEYS, ROLE_KEYS } from '../roles/role-keys';

describe('default role permissions', () => {
  it('defines a permission set for every role', () => {
    for (const roleKey of ALL_ROLE_KEYS) {
      expect(Array.isArray(DEFAULT_ROLE_PERMISSIONS[roleKey])).toBe(true);
    }
  });

  it('only uses known permission keys', () => {
    for (const roleKey of ALL_ROLE_KEYS) {
      for (const permission of DEFAULT_ROLE_PERMISSIONS[roleKey]) {
        expect(ALL_PERMISSION_KEYS).toContain(permission);
      }
    }
  });

  it('gives the super admin every permission', () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.SUPER_ADMIN])).toEqual(
      new Set(ALL_PERMISSION_KEYS),
    );
  });

  it('never gives client roles internal-only permissions', () => {
    const internalOnly = [
      PERMISSIONS.COMMENT_INTERNAL,
      PERMISSIONS.COST_READ,
      PERMISSIONS.CALL_READ_INTERNAL,
      PERMISSIONS.TEST_CREDENTIAL_REVEAL,
      PERMISSIONS.RELEASE_PUBLISH,
      PERMISSIONS.GITHUB_MANAGE,
      PERMISSIONS.AUDIT_LOG_READ,
    ];
    for (const roleKey of CLIENT_ROLE_KEYS) {
      for (const permission of internalOnly) {
        expect(DEFAULT_ROLE_PERMISSIONS[roleKey]).not.toContain(permission);
      }
    }
  });

  it('keeps client roles inside the client-safe permission list', () => {
    for (const roleKey of CLIENT_ROLE_KEYS) {
      for (const permission of DEFAULT_ROLE_PERMISSIONS[roleKey]) {
        expect(CLIENT_SAFE_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('keeps internal-only permissions out of the client-safe list', () => {
    expect(CLIENT_SAFE_PERMISSIONS).not.toContain(PERMISSIONS.COMMENT_INTERNAL);
    expect(CLIENT_SAFE_PERMISSIONS).not.toContain(PERMISSIONS.COST_READ);
    expect(CLIENT_SAFE_PERMISSIONS).not.toContain(PERMISSIONS.APPROVAL_MANAGE);
    expect(CLIENT_SAFE_PERMISSIONS).not.toContain(PERMISSIONS.ROLE_MANAGE);
  });
});
