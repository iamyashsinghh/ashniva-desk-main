import { PERMISSIONS, isClientRole, type SessionUser } from '@ashniva/types';

import { canUseInternalChat } from '../features/chat/chat-access';

/**
 * Which tabs each person gets.
 *
 * Two decisions, both deliberate.
 *
 * **The bar is for the work that happens away from a desk**: your tasks, tickets, messages,
 * alerts, and for a client, what their team has published. Everything else the web offers —
 * delivery, billing, reports, administration — is a stack route opened from the side menu, laid
 * out for one column rather than squeezed from the desktop's.
 *
 * **Permissions, not roles.** The tab list is derived from what the person may actually do, so a
 * custom role built on the Developer template gets the tabs its permissions justify rather than
 * the tabs a Developer usually has. A tab appearing is never authority: the API decides.
 */

export type TabName =
  'Home' | 'Tasks' | 'Tickets' | 'Messages' | 'Updates' | 'Notifications' | 'Invoices' | 'Profile';

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
  Messages: { name: 'Messages', label: 'Messages', hint: 'Your conversations' },
  Updates: { name: 'Updates', label: 'Updates', hint: 'Project updates and release notes' },
  Notifications: { name: 'Notifications', label: 'Alerts', hint: 'What needs your attention' },
  Invoices: { name: 'Invoices', label: 'Invoices', hint: 'Your invoices' },
  Profile: { name: 'Profile', label: 'You', hint: 'Your profile and notification settings' },
};

type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Every tab screen a person may be on, in order — the bar's entries and the ones the side menu
 * opens in place.
 *
 * All of them are registered with the tab navigator so a notification or a menu entry can land on
 * one with the bar still underneath; only `barTabsFor` decides which get a button.
 */
export function tabsFor(user: SessionUser): TabDefinition[] {
  const has = (permission: Permission) => user.permissions.includes(permission);

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
  if (canUseInternalChat(user)) {
    tabs.push(TAB.Messages);
  }
  tabs.push(TAB.Notifications, TAB.Profile);
  return tabs;
}

/**
 * The buttons along the bottom.
 *
 * Deliberately short, and with no Menu button: the side menu opens from the ☰ button at the top of
 * every tab and holds everything else — projects, approvals, testing, the support queue and the
 * rest — as the web's sidebar does. Internal people get their main work list (tasks, or tickets
 * for somebody without tasks), messages when they can chat, and alerts; with no chat, the second
 * work list takes that place. A bar left with fewer than three buttons gets the profile.
 */
export function barTabsFor(user: SessionUser): TabDefinition[] {
  const names = new Set(tabsFor(user).map((tab) => tab.name));

  if (isClientRole(user.roleKey)) {
    return [TAB.Home, TAB.Tickets, TAB.Updates, TAB.Invoices];
  }

  const work = (['Tasks', 'Tickets'] as const).filter((name) => names.has(name));
  const middle: TabName[] = names.has('Messages')
    ? [...work.slice(0, 1), 'Messages']
    : work.slice(0, 2);
  const bar = [TAB.Home, ...middle.map((name) => TAB[name]), TAB.Notifications];
  return bar.length < 3 ? [...bar, TAB.Profile] : bar;
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
 * Not every screen in this set is a tab. Projects, the testing queue, approvals and the rest are
 * stack routes opened from the side menu — see `barTabsFor`. They are still screens this app has,
 * so a notification about one opens it.
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
  'Messages',
  'ProjectSummary',
  'InternWork',
  'InternWorkForm',
  'CompletedToday',
  'SessionLogs',
  'SupportQueue',
  'PortalProjects',
  'PortalProjectDetail',
  'PortalContracts',
  'PortalContractDetail',
  'PortalChangeRequests',
  'PortalChangeRequestDetail',
  'PortalReports',
  'PortalProgressSummaries',
  'PortalProgressSummary',
  'Contracts',
  'ContractDetail',
  'ChangeRequests',
  'ChangeRequestDetail',
  'MilestoneDetail',
  'BillingInvoices',
  'BillingInvoiceDetail',
  'Payments',
  'Reports',
  'AdvancedReports',
  'AiSummaries',
  'AiSummaryDetail',
  'AiUsage',
  'Releases',
  'ReleaseDetail',
  'ReleaseNoteDetail',
  'Problems',
  'ProblemDetail',
  'RecurringIssues',
  'Incidents',
  'IncidentDetail',
  'Search',
]);
