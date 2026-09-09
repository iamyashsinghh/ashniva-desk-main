import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_KEYS,
  type RoleKey,
  type SessionUser,
} from '@ashniva/types';

import { initialTabFor, isMobileScreen, tabsFor } from './tabs';

/**
 * Role-aware navigation.
 *
 * Every one of the nine seeded roles is checked, because the failure this guards against is a
 * role nobody thought about getting a tab bar with one entry, or with somebody else's screens.
 */

function userWith(roleKey: RoleKey): SessionUser {
  return {
    id: 'u1',
    email: 'someone@example.com',
    name: 'Someone',
    title: null,
    roleKey,
    roleId: 'r1',
    roleName: roleKey,
    isCustomRole: false,
    permissions: DEFAULT_ROLE_PERMISSIONS[roleKey],
    showDevelopmentSection: true,
    organization: { id: 'o1', name: 'Org', slug: 'org', isServiceProvider: true },
    organizations: [],
  } as unknown as SessionUser;
}

const ALL_ROLES = Object.values(ROLE_KEYS);

describe('every role gets a usable tab bar', () => {
  it.each(ALL_ROLES)('%s has between two and five tabs', (roleKey) => {
    const tabs = tabsFor(userWith(roleKey));
    expect(tabs.length).toBeGreaterThanOrEqual(2);
    expect(tabs.length).toBeLessThanOrEqual(5);
  });

  it.each(ALL_ROLES)('%s has no duplicate tab', (roleKey) => {
    const names = tabsFor(userWith(roleKey)).map((tab) => tab.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(ALL_ROLES)('%s lands on a tab it actually has', (roleKey) => {
    const user = userWith(roleKey);
    const names = tabsFor(user).map((tab) => tab.name);
    expect(names).toContain(initialTabFor(user));
  });

  it.each(ALL_ROLES)('%s can always reach its profile', (roleKey) => {
    // Signing out lives there, so a role with no Profile tab is a role that cannot sign out.
    expect(tabsFor(userWith(roleKey)).map((tab) => tab.name)).toContain('Profile');
  });
});

describe('internal roles', () => {
  it('gives a developer their tasks', () => {
    const names = tabsFor(userWith(ROLE_KEYS.DEVELOPER)).map((tab) => tab.name);
    expect(names).toContain('Tasks');
    expect(names).toContain('Tickets');
  });

  it('gives a support executive tickets', () => {
    expect(tabsFor(userWith(ROLE_KEYS.SUPPORT_EXECUTIVE)).map((tab) => tab.name)).toContain(
      'Tickets',
    );
  });

  it('gives nobody internal the client Invoices or Updates tab', () => {
    for (const roleKey of [
      ROLE_KEYS.SUPER_ADMIN,
      ROLE_KEYS.PROJECT_MANAGER,
      ROLE_KEYS.TEAM_LEAD,
      ROLE_KEYS.DEVELOPER,
      ROLE_KEYS.TESTER,
      ROLE_KEYS.SUPPORT_EXECUTIVE,
      ROLE_KEYS.INTERNAL_EMPLOYEE,
    ]) {
      const names = tabsFor(userWith(roleKey)).map((tab) => tab.name);
      expect(names).not.toContain('Invoices');
      expect(names).not.toContain('Updates');
    }
  });
});

describe('client roles', () => {
  it.each([ROLE_KEYS.CLIENT_ADMIN, ROLE_KEYS.CLIENT_EMPLOYEE])(
    '%s gets the portal tabs and nothing internal',
    (roleKey) => {
      const names = tabsFor(userWith(roleKey)).map((tab) => tab.name);
      expect(names).toEqual(['Home', 'Tickets', 'Updates', 'Invoices', 'Profile']);
      // A client never gets the internal task list, whatever permissions a custom role holds.
      expect(names).not.toContain('Tasks');
      expect(names).not.toContain('Notifications');
    },
  );
});

describe('a custom role', () => {
  it('gets tabs from its permissions, not from the template it was cloned from', () => {
    const user = userWith(ROLE_KEYS.DEVELOPER);
    const stripped = { ...user, isCustomRole: true, permissions: [] } as unknown as SessionUser;

    const names = tabsFor(stripped).map((tab) => tab.name);
    expect(names).not.toContain('Tasks');
    expect(names).not.toContain('Tickets');
    expect(names).toEqual(['Home', 'Notifications', 'Profile']);
  });
});

describe('what belongs on a phone', () => {
  it('knows the screens the app has', () => {
    expect(isMobileScreen('TaskDetail')).toBe(true);
    expect(isMobileScreen('TicketDetail')).toBe(true);
  });

  it('does not claim to have the desktop administration screens', () => {
    for (const screen of [
      'Users',
      'Roles',
      'SlaPolicies',
      'AuditLog',
      'BillingSettings',
      'Reports',
    ]) {
      expect(isMobileScreen(screen)).toBe(false);
    }
  });
});
