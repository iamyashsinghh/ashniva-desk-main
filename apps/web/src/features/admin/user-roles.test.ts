import { ROLE_KEYS } from '@ashniva/types';

import { assignableRoleKeys, defaultRoleChoice } from './user-roles';

describe('assignableRoleKeys', () => {
  it('offers staff roles inside the service-provider company', () => {
    const keys = assignableRoleKeys(false, { isServiceProvider: true });
    expect(keys).toContain(ROLE_KEYS.DEVELOPER);
    expect(keys).toContain(ROLE_KEYS.SUPER_ADMIN);
    expect(keys).not.toContain(ROLE_KEYS.CLIENT_EMPLOYEE);
  });

  it('offers only client roles inside a client company', () => {
    const keys = assignableRoleKeys(false, { isServiceProvider: false });
    expect(keys).toEqual([ROLE_KEYS.CLIENT_ADMIN, ROLE_KEYS.CLIENT_EMPLOYEE]);
  });

  it('keeps a client admin on client roles even against the provider org', () => {
    expect(assignableRoleKeys(true, { isServiceProvider: true })).toEqual([
      ROLE_KEYS.CLIENT_ADMIN,
      ROLE_KEYS.CLIENT_EMPLOYEE,
    ]);
  });
});

describe('defaultRoleChoice', () => {
  it('defaults to developer for Ashniva staff', () => {
    expect(defaultRoleChoice(false, { isServiceProvider: true })).toBe('key:DEVELOPER');
  });

  it('defaults to client employee for a client company', () => {
    expect(defaultRoleChoice(false, { isServiceProvider: false })).toBe('key:CLIENT_EMPLOYEE');
  });
});
