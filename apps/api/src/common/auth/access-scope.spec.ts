import { ForbiddenException } from '@nestjs/common';
import { ROLE_KEYS, type AuthenticatedUser } from '@ashniva/types';

import { assertCanManageOrganization, isClientUser, isInternalUser } from './access-scope';

function principal(overrides: Partial<AuthenticatedUser>): AuthenticatedUser {
  return {
    userId: 'u',
    organizationId: 'org-provider',
    roleKey: ROLE_KEYS.DEVELOPER,
    permissions: [],
    isServiceProvider: true,
    ...overrides,
  };
}

describe('access scope', () => {
  it('treats provider members with staff roles as internal', () => {
    expect(isInternalUser(principal({}))).toBe(true);
    expect(isClientUser(principal({}))).toBe(false);
  });

  it('treats members of other organizations as clients, whatever their role', () => {
    const groupEmployee = principal({
      organizationId: 'org-group',
      isServiceProvider: false,
      roleKey: ROLE_KEYS.INTERNAL_EMPLOYEE,
    });
    expect(isInternalUser(groupEmployee)).toBe(false);
    expect(
      isClientUser(principal({ isServiceProvider: false, roleKey: ROLE_KEYS.CLIENT_ADMIN })),
    ).toBe(true);
  });

  it('lets internal staff manage any organization but clients only their own', () => {
    expect(() => assertCanManageOrganization(principal({}), 'org-x')).not.toThrow();
    const clientAdmin = principal({
      organizationId: 'org-acme',
      isServiceProvider: false,
      roleKey: ROLE_KEYS.CLIENT_ADMIN,
    });
    expect(() => assertCanManageOrganization(clientAdmin, 'org-acme')).not.toThrow();
    expect(() => assertCanManageOrganization(clientAdmin, 'org-zenith')).toThrow(
      ForbiddenException,
    );
  });
});
