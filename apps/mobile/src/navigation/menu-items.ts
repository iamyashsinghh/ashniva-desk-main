import {
  PERMISSIONS,
  ROLE_KEYS,
  TASK_LIST_VIEW,
  isClientRole,
  type SessionUser,
} from '@ashniva/types';

import { canUseInternalChat } from '../features/chat/chat-access';
import type { IconName } from '../shared/components/Icon';
import { adminSection, clientPortalItems, deliverySections } from './menu-sections';
import type { RootStackParamList } from './param-lists';
import { tabsFor, type TabName } from './tabs';

/**
 * The side menu: every place the phone can take this person.
 *
 * It follows the web sidebar (`apps/web/src/app/layout/navigation.ts`) entry for entry, with the
 * same permission test on each, so the two apps offer the same doors — delivery, billing, reports
 * and administration included (`menu-sections.ts`). As everywhere, an entry appearing is never
 * authority: the API decides.
 */

/** A stack route that carries nothing and can be opened straight from the menu. */
export type MenuRoute = {
  [K in keyof RootStackParamList]: [RootStackParamList[K]] extends [undefined] ? K : never;
}[keyof RootStackParamList];

export type MenuTarget =
  | { kind: 'tab'; tab: TabName }
  | { kind: 'route'; screen: MenuRoute }
  | { kind: 'taskList'; title: string; query: Record<string, string> };

export interface MenuItem {
  key: string;
  label: string;
  icon: IconName;
  target: MenuTarget;
  /** Which live count to show beside it, if any. */
  badge?: 'alerts' | 'chat';
}

export interface MenuSection {
  heading: string;
  items: MenuItem[];
}

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const tab = (key: string, label: string, icon: IconName, name: TabName): MenuItem => ({
  key,
  label,
  icon,
  target: { kind: 'tab', tab: name },
});

const route = (key: string, label: string, icon: IconName, screen: MenuRoute): MenuItem => ({
  key,
  label,
  icon,
  target: { kind: 'route', screen },
});

function accountSection(tabs: ReadonlySet<TabName>): MenuSection {
  const items: MenuItem[] = [];
  if (tabs.has('Profile')) {
    items.push(tab('profile', 'Your profile', 'person-circle-outline', 'Profile'));
  }
  items.push(
    route('preferences', 'Notification settings', 'options-outline', 'NotificationPreferences'),
    route('password', 'Change password', 'key-outline', 'ChangePassword'),
  );
  return { heading: 'Account', items };
}

function clientMenu(user: SessionUser, has: (p: Permission) => boolean): MenuSection[] {
  const extra = clientPortalItems(user);
  const portal: MenuItem[] = [
    tab('home', 'Overview', 'home-outline', 'Home'),
    ...extra.beforeTickets,
    tab('tickets', 'Tickets', 'ticket-outline', 'Tickets'),
  ];
  if (has(PERMISSIONS.APPROVAL_DECIDE)) {
    portal.push(route('approvals', 'Approvals', 'checkmark-done-outline', 'Approvals'));
  }
  if (has(PERMISSIONS.UAT_DECIDE)) {
    portal.push(route('sign-offs', 'Sign-off', 'ribbon-outline', 'SignOffs'));
  }
  portal.push(
    tab('updates', 'Updates', 'megaphone-outline', 'Updates'),
    ...extra.afterUpdates,
    tab('invoices', 'Invoices', 'receipt-outline', 'Invoices'),
  );
  return [
    { heading: 'Portal', items: portal },
    accountSection(new Set(tabsFor(user).map((entry) => entry.name))),
  ];
}

/** Intern work goes to interns, and to the leads who hand it out — the web's rule. */
function seesInternWork(user: SessionUser, has: (p: Permission) => boolean): boolean {
  const leads: readonly string[] = [
    ROLE_KEYS.SUPER_ADMIN,
    ROLE_KEYS.PROJECT_MANAGER,
    ROLE_KEYS.TEAM_LEAD,
  ];
  return (
    user.roleKey === ROLE_KEYS.INTERN ||
    (has(PERMISSIONS.TASK_ASSIGN) && leads.includes(user.roleKey))
  );
}

export function menuFor(user: SessionUser): MenuSection[] {
  const has = (permission: Permission) => user.permissions.includes(permission);
  if (isClientRole(user.roleKey)) {
    return clientMenu(user, has);
  }
  const tabs = new Set(tabsFor(user).map((entry) => entry.name));

  const work: MenuItem[] = [tab('home', 'Dashboard', 'home-outline', 'Home')];
  if (tabs.has('Tasks')) {
    work.push({
      key: 'today',
      label: 'My tasks today',
      icon: 'today-outline',
      target: { kind: 'taskList', title: 'My tasks today', query: { view: TASK_LIST_VIEW.TODAY } },
    });
    work.push(tab('tasks', 'Tasks', 'checkbox-outline', 'Tasks'));
  }
  if (seesInternWork(user, has)) {
    work.push(route('intern-work', 'Intern work', 'school-outline', 'InternWork'));
  }
  if (tabs.has('Tasks') && (has(PERMISSIONS.TASK_REVIEW) || user.roleKey === ROLE_KEYS.TESTER)) {
    work.push({
      key: 'reviews',
      label: 'Reviews',
      icon: 'eye-outline',
      target: { kind: 'taskList', title: 'Reviews', query: { view: TASK_LIST_VIEW.REVIEW } },
    });
  }
  if (tabs.has('Tickets')) {
    work.push(
      tab(
        'tickets',
        user.roleKey === ROLE_KEYS.INTERNAL_EMPLOYEE ? 'My tickets' : 'Tickets',
        'ticket-outline',
        'Tickets',
      ),
    );
  }
  if (has(PERMISSIONS.PROJECT_READ)) {
    work.push(route('projects', 'Projects', 'folder-open-outline', 'Projects'));
  }
  if (canUseInternalChat(user)) {
    work.push({ ...tab('messages', 'Messages', 'chatbubbles-outline', 'Messages'), badge: 'chat' });
  }
  if (has(PERMISSIONS.APPROVAL_MANAGE) || has(PERMISSIONS.APPROVAL_DECIDE)) {
    work.push(route('approvals', 'Approvals', 'checkmark-done-outline', 'Approvals'));
  }
  if (has(PERMISSIONS.QA_RECORD_RESULT) || has(PERMISSIONS.QA_ASSIGN)) {
    work.push(route('qa', 'Testing', 'flask-outline', 'QaQueue'));
  }
  if (has(PERMISSIONS.SUPPORT_ROUTING_MANAGE)) {
    work.push(route('support-queue', 'Support queue', 'git-network-outline', 'SupportQueue'));
  }
  if (tabs.has('Tasks')) {
    work.push(route('completed', 'Completed today', 'checkmark-circle-outline', 'CompletedToday'));
  }

  const time: MenuItem[] = [];
  if (has(PERMISSIONS.REPORT_READ_OWN)) {
    time.push(route('my-time', 'My time', 'time-outline', 'MyTime'));
  }
  if (has(PERMISSIONS.REPORT_READ_TEAM)) {
    time.push(route('session-logs', 'Login & break log', 'log-in-outline', 'SessionLogs'));
  }
  time.push({
    ...tab('alerts', 'Notifications', 'notifications-outline', 'Notifications'),
    badge: 'alerts',
  });

  return [
    { heading: 'Work', items: work },
    ...deliverySections(user),
    { heading: 'Time & alerts', items: time },
    ...adminSection(user),
    accountSection(tabs),
  ];
}
