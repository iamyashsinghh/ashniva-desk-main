import { PERMISSIONS, isClientRole, type SessionUser } from '@ashniva/types';

/**
 * Which tabs each person gets.
 *
 * Two decisions, both deliberate.
 *
 * **The phone is not the desktop.** Administration — users, roles, SLA policies, billing
 * settings, audit history, integrations, reports — is not here and is not planned to be. Those
 * screens are dense, consequential and rarely urgent, and a cramped version of one is worse than
 * no version. The phone carries the work that happens away from a desk: your tasks, tickets,
 * notifications, and for a client, what their team has published.
 *
 * **Permissions, not roles.** The tab list is derived from what the person may actually do, so a
 * custom role built on the Developer template gets the tabs its permissions justify rather than
 * the tabs a Developer usually has. A tab appearing is never authority: the API decides.
 */

export type TabName =
  'Home' | 'Tasks' | 'Tickets' | 'Updates' | 'Notifications' | 'Invoices' | 'Profile';

export interface TabDefinition {
  name: TabName;
  /** Shown under the icon and read out by a screen reader. */
  label: string;
  /** A short description for the accessibility hint. */
  hint: string;
}

const TAB: Record<TabName, TabDefinition> = {
  Home: { name: 'Home', label: 'Home', hint: 'Your day at a glance' },
  Tasks: { name: 'Tasks', label: 'My tasks', hint: 'Tasks assigned to you' },
  Tickets: { name: 'Tickets', label: 'Tickets', hint: 'Support tickets' },
  Updates: { name: 'Updates', label: 'Updates', hint: 'Project updates and release notes' },
  Notifications: { name: 'Notifications', label: 'Alerts', hint: 'What needs your attention' },
  Invoices: { name: 'Invoices', label: 'Invoices', hint: 'Your invoices' },
  Profile: { name: 'Profile', label: 'You', hint: 'Your profile and notification settings' },
};

/**
 * The tabs for a person, in order.
 *
 * A bottom bar holds five comfortably; more and the labels truncate. So the lists below are
 * capped at five, and anything past that is reachable from a screen rather than a tab.
 */
export function tabsFor(user: SessionUser): TabDefinition[] {
  const has = (permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) =>
    user.permissions.includes(permission);

  if (isClientRole(user.roleKey)) {
    // A client's phone is for raising a ticket, reading what shipped, and checking an invoice.
    return [TAB.Home, TAB.Tickets, TAB.Updates, TAB.Invoices, TAB.Profile];
  }

  const tabs: TabDefinition[] = [TAB.Home];

  if (has(PERMISSIONS.TASK_READ)) {
    tabs.push(TAB.Tasks);
  }
  if (has(PERMISSIONS.TICKET_READ) || has(PERMISSIONS.TICKET_RAISE)) {
    tabs.push(TAB.Tickets);
  }
  tabs.push(TAB.Notifications, TAB.Profile);

  return tabs.slice(0, 5);
}

/** Where a person lands after signing in. */
export function initialTabFor(user: SessionUser): TabName {
  return tabsFor(user)[0]?.name ?? 'Profile';
}

/**
 * Whether a screen belongs on the phone at all.
 *
 * Used by the deep-link handler: a push notification about an audit entry should open the app
 * somewhere sensible rather than a screen that does not exist here.
 *
 * Not every screen in this set is a tab. Projects, conversations and the testing queue are stack
 * routes reached from Home, because the bar is capped at five and none of them is worth what it
 * would displace — see the note on `tabsFor`. They are still screens this app has, so a
 * notification about one opens it.
 */
export function isMobileScreen(screen: string): boolean {
  return MOBILE_SCREENS.has(screen);
}

export const MOBILE_SCREENS = new Set([
  'Home',
  'Tasks',
  'TaskDetail',
  'CompleteTask',
  'Tickets',
  'TicketDetail',
  'RaiseTicket',
  'Notifications',
  'Updates',
  'ReleaseNotes',
  'ProgressSummaries',
  'Invoices',
  'InvoiceDetail',
  'Profile',
  'NotificationPreferences',
  'Projects',
  'ProjectDetail',
  'Conversations',
  'Conversation',
  'NewConversation',
  'ConversationGroup',
  'QaQueue',
  'QaAssignment',
  'Approvals',
  'ApprovalDetail',
  'SignOffs',
  'SignOff',
  'MyTime',
  'ReleaseNote',
]);
