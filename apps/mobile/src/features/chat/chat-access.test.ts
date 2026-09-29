import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  isClientRole,
  type SessionUser,
} from '@ashniva/types';

import { canInspectConversations, canStartPersonalChat, canUseInternalChat } from './chat-access';
import { CONVERSATION_FILTER, inboxFiltersFor, isInboxKind } from './conversation-filters';

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

  it('lets only managers and leads start a private chat', () => {
    expect(canStartPersonalChat(userWith({ roleKey: ROLE_KEYS.PROJECT_MANAGER }))).toBe(true);
    expect(canStartPersonalChat(userWith({ roleKey: ROLE_KEYS.TEAM_LEAD }))).toBe(true);
    expect(canStartPersonalChat(userWith({ roleKey: ROLE_KEYS.SUPER_ADMIN }))).toBe(true);
    expect(canStartPersonalChat(userWith({ roleKey: ROLE_KEYS.DEVELOPER }))).toBe(false);
    expect(canStartPersonalChat(userWith({ roleKey: ROLE_KEYS.TESTER }))).toBe(false);
  });

  it('lets anybody holding organization-wide reach start one, whatever the role', () => {
    const developer = userWith({
      permissions: [
        ...DEFAULT_ROLE_PERMISSIONS[ROLE_KEYS.DEVELOPER],
        PERMISSIONS.CONVERSATION_REACH_ORGANIZATION,
      ],
    });
    expect(canStartPersonalChat(developer)).toBe(true);
  });

  it('never lets somebody without internal chat start a private one, even a manager', () => {
    expect(
      canStartPersonalChat(
        userWith({ roleKey: ROLE_KEYS.PROJECT_MANAGER, permissions: [PERMISSIONS.TASK_READ] }),
      ),
    ).toBe(false);
  });
});

/**
 * Every seeded role, with its seeded permissions, against what the web and the API give it.
 *
 * The table is written out rather than derived, so a change to a role's defaults that changes what
 * chat offers is a failing test somebody has to read, not a silent new behaviour.
 */
describe('each seeded role', () => {
  const CLIENT_ORG = {
    id: 'o2',
    name: 'Client Co',
    slug: 'client-co',
    isServiceProvider: false,
  } as SessionUser['organization'];

  it.each([
    // role, internal chat, private chat and people, administrator view
    [ROLE_KEYS.SUPER_ADMIN, true, true, true],
    [ROLE_KEYS.PROJECT_MANAGER, true, true, false],
    [ROLE_KEYS.TEAM_LEAD, true, true, false],
    [ROLE_KEYS.DEVELOPER, true, false, false],
    [ROLE_KEYS.TESTER, true, false, false],
    [ROLE_KEYS.SUPPORT_EXECUTIVE, true, false, false],
    // The seeded intern holds no `conversation:participate`, so no chat at all.
    [ROLE_KEYS.INTERN, false, false, false],
    [ROLE_KEYS.INTERNAL_EMPLOYEE, true, false, false],
    [ROLE_KEYS.CLIENT_ADMIN, false, false, false],
    [ROLE_KEYS.CLIENT_EMPLOYEE, false, false, false],
  ] as const)('%s: chat %s, personal %s, inspect %s', (roleKey, chat, personal, inspect) => {
    const user = userWith({
      roleKey,
      permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
      ...(isClientRole(roleKey) ? { organization: CLIENT_ORG } : {}),
    });

    expect(canUseInternalChat(user)).toBe(chat);
    expect(canStartPersonalChat(user)).toBe(personal);
    expect(canInspectConversations(user)).toBe(inspect);
    if (chat) {
      // The inbox a role sees follows from the same answer: no Direct chip, and no direct rows,
      // for somebody who may only write in the team group.
      expect(inboxFiltersFor(personal).includes(CONVERSATION_FILTER.DIRECT)).toBe(personal);
      expect(isInboxKind('SCOPE_DIRECT', personal)).toBe(personal);
      expect(isInboxKind('GROUP', personal)).toBe(true);
      expect(isInboxKind('PROJECT', personal)).toBe(false);
    }
  });
});
