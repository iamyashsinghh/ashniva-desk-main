import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  type RoleKey,
  type SessionUser,
} from '@ashniva/types';

import { menuFor, type MenuItem } from './menu-items';
import { tabsFor } from './tabs';

function userWith(roleKey: RoleKey, permissions = DEFAULT_ROLE_PERMISSIONS[roleKey]): SessionUser {
  return {
    id: 'u1',
    email: 'someone@example.com',
    name: 'Someone',
    title: null,
    roleKey,
    roleId: 'r1',
    roleName: roleKey,
    isCustomRole: false,
    permissions,
    organization: { id: 'o1', name: 'Org', slug: 'org', isServiceProvider: true },
    organizations: [],
  } as unknown as SessionUser;
}

const items = (user: SessionUser): MenuItem[] => menuFor(user).flatMap((section) => section.items);
const keys = (user: SessionUser) => items(user).map((item) => item.key);

describe('the side menu', () => {
  it.each(Object.values(ROLE_KEYS))('%s only links to tabs it has, once each', (roleKey) => {
    const user = userWith(roleKey);
    const tabs = tabsFor(user).map((tab) => tab.name);
    const list = items(user);
    expect(new Set(list.map((item) => item.key)).size).toBe(list.length);
    for (const item of list) {
      if (item.target.kind === 'tab') {
        expect(tabs).toContain(item.target.tab);
      }
    }
    expect(keys(user)).toContain('password');
  });

  it('gives interns and the leads who assign to them the intern work list', () => {
    expect(keys(userWith(ROLE_KEYS.INTERN))).toContain('intern-work');
    expect(keys(userWith(ROLE_KEYS.TEAM_LEAD))).toContain('intern-work');
    expect(keys(userWith(ROLE_KEYS.DEVELOPER))).not.toContain('intern-work');
  });

  it('offers the support queue only with support routing', () => {
    const lead = userWith(ROLE_KEYS.TEAM_LEAD);
    const withRouting = userWith(ROLE_KEYS.TEAM_LEAD, [
      ...lead.permissions,
      PERMISSIONS.SUPPORT_ROUTING_MANAGE,
    ]);
    const without = userWith(
      ROLE_KEYS.TEAM_LEAD,
      lead.permissions.filter((key) => key !== PERMISSIONS.SUPPORT_ROUTING_MANAGE),
    );
    expect(keys(withRouting)).toContain('support-queue');
    expect(keys(without)).not.toContain('support-queue');
  });

  it('offers the login and break log only to team readers', () => {
    const dev = userWith(ROLE_KEYS.DEVELOPER, [PERMISSIONS.TASK_READ]);
    expect(keys(dev)).not.toContain('session-logs');
    const lead = userWith(ROLE_KEYS.TEAM_LEAD, [PERMISSIONS.REPORT_READ_TEAM]);
    expect(keys(lead)).toContain('session-logs');
  });

  it('carries the web’s task shortcuts as filtered lists', () => {
    const today = items(userWith(ROLE_KEYS.DEVELOPER)).find((item) => item.key === 'today');
    expect(today?.target).toEqual({
      kind: 'taskList',
      title: 'My tasks today',
      query: { view: 'today' },
    });
  });

  it.each([ROLE_KEYS.CLIENT_ADMIN, ROLE_KEYS.CLIENT_EMPLOYEE])(
    '%s sees the portal and nothing internal',
    (roleKey) => {
      const list = keys(userWith(roleKey));
      for (const internal of ['tasks', 'messages', 'projects', 'qa', 'support-queue']) {
        expect(list).not.toContain(internal);
      }
      expect(list).toContain('tickets');
      expect(list).toContain('invoices');
    },
  );
});
