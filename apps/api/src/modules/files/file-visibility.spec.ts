import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  VISIBILITY,
  type AuthenticatedUser,
  type PermissionKey,
  type RoleKey,
} from '@ashniva/types';

import { readableVisibility } from './file-visibility';

function actor(roleKey: RoleKey, isServiceProvider: boolean): AuthenticatedUser {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    roleKey,
    permissions: [...DEFAULT_ROLE_PERMISSIONS[roleKey]] as PermissionKey[],
    isServiceProvider,
  };
}

describe('readableVisibility', () => {
  it.each([
    ROLE_KEYS.SUPER_ADMIN,
    ROLE_KEYS.PROJECT_MANAGER,
    ROLE_KEYS.TEAM_LEAD,
    ROLE_KEYS.DEVELOPER,
    ROLE_KEYS.TESTER,
    ROLE_KEYS.SUPPORT_EXECUTIVE,
  ])('lets %s see both kinds, because they hold comment:internal', (roleKey) => {
    expect(DEFAULT_ROLE_PERMISSIONS[roleKey]).toContain(PERMISSIONS.COMMENT_INTERNAL);
    expect(readableVisibility(actor(roleKey, true))).toBeUndefined();
  });

  // The reproduction this rule exists for: an internal employee of the provider organization
  // holding ticket:raise, ticket:read, ticket:reply-public and conversation:participate, who was
  // served three different clients' INTERNAL attachments.
  it('narrows an internal employee to client-visible attachments', () => {
    expect(DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.INTERNAL_EMPLOYEE]).not.toContain(
      PERMISSIONS.COMMENT_INTERNAL,
    );
    expect(readableVisibility(actor(ROLE_KEYS.INTERNAL_EMPLOYEE, true))).toBe(VISIBILITY.CLIENT);
  });

  it.each([ROLE_KEYS.CLIENT_ADMIN, ROLE_KEYS.CLIENT_EMPLOYEE])(
    'narrows %s to client-visible attachments',
    (roleKey) => {
      expect(readableVisibility(actor(roleKey, false))).toBe(VISIBILITY.CLIENT);
    },
  );

  // A client role inside the provider organization is still a client: `isInternalUser` says so,
  // and this must not read the permission list to reach that conclusion.
  it('narrows a client role even when its organization is the service provider', () => {
    expect(readableVisibility(actor(ROLE_KEYS.CLIENT_ADMIN, true))).toBe(VISIBILITY.CLIENT);
  });
});
