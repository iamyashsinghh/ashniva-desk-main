import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_KEYS, type SessionUser } from '@ashniva/types';

import { canUseInternalChat } from './chat-access';

/**
 * The client boundary, on the one feature that has no client shape at all.
 *
 * The API refuses a client at the first check of every route on the communication controller,
 * before any query runs, and there is no mapper anywhere that could produce a client payload for a
 * conversation. This is not that control — it is the app not offering somebody a bolted door, and
 * the assertion that it stays that way as roles are added.
 */

function userWith(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'u1',
    email: 'someone@example.com',
    name: 'Someone',
    title: null,
    roleKey: ROLE_KEYS.DEVELOPER,
    roleId: 'r1',
    roleName: 'Developer',
    isCustomRole: false,
    permissions: DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.DEVELOPER],
    showDevelopmentSection: true,
    organization: { id: 'o1', name: 'Org', slug: 'org', isServiceProvider: true },
    organizations: [],
    ...overrides,
  } as unknown as SessionUser;
}

describe('a client never gets an entry point', () => {
  it.each([ROLE_KEYS.CLIENT_ADMIN, ROLE_KEYS.CLIENT_EMPLOYEE])('%s is refused', (roleKey) => {
    expect(
      canUseInternalChat(
        userWith({
          roleKey,
          permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
          organization: {
            id: 'o2',
            name: 'Client Co',
            slug: 'client-co',
            isServiceProvider: false,
          } as SessionUser['organization'],
        }),
      ),
    ).toBe(false);
  });

  it('is refused even holding the permission outright', () => {
    // The case the whole function exists for. A misconfigured custom role, or a permission granted
    // by mistake, must not open a door the API has no client side of at all.
    expect(
      canUseInternalChat(
        userWith({
          roleKey: ROLE_KEYS.CLIENT_ADMIN,
          isCustomRole: true,
          permissions: [PERMISSIONS.CONVERSATION_PARTICIPATE],
          organization: {
            id: 'o2',
            name: 'Client Co',
            slug: 'client-co',
            isServiceProvider: false,
          } as SessionUser['organization'],
        }),
      ),
    ).toBe(false);
  });

  it('is refused for a custom role in a client organization, whatever it is called', () => {
    // A role-name check alone would let this one through: the role key says Developer, and the
    // organization is the client's. Both halves of the API's own test are repeated for this.
    expect(
      canUseInternalChat(
        userWith({
          roleKey: ROLE_KEYS.DEVELOPER,
          isCustomRole: true,
          permissions: [PERMISSIONS.CONVERSATION_PARTICIPATE],
          organization: {
            id: 'o2',
            name: 'Client Co',
            slug: 'client-co',
            isServiceProvider: false,
          } as SessionUser['organization'],
        }),
      ),
    ).toBe(false);
  });

  it('is refused when there is no session at all', () => {
    expect(canUseInternalChat(null)).toBe(false);
  });
});

describe('internal staff', () => {
  it('gets it when the permission is held', () => {
    expect(
      canUseInternalChat(userWith({ permissions: [PERMISSIONS.CONVERSATION_PARTICIPATE] })),
    ).toBe(true);
  });

  it('does not get it without the permission', () => {
    expect(canUseInternalChat(userWith({ permissions: [PERMISSIONS.TASK_READ] }))).toBe(false);
  });

  it('matches what each seeded internal role is actually granted', () => {
    for (const roleKey of [
      ROLE_KEYS.SUPER_ADMIN,
      ROLE_KEYS.PROJECT_MANAGER,
      ROLE_KEYS.TEAM_LEAD,
      ROLE_KEYS.DEVELOPER,
      ROLE_KEYS.TESTER,
      ROLE_KEYS.SUPPORT_EXECUTIVE,
      ROLE_KEYS.INTERNAL_EMPLOYEE,
    ]) {
      const permissions = DEFAULT_ROLE_PERMISSIONS[roleKey];
      expect(canUseInternalChat(userWith({ roleKey, permissions }))).toBe(
        permissions.includes(PERMISSIONS.CONVERSATION_PARTICIPATE),
      );
    }
  });
});
