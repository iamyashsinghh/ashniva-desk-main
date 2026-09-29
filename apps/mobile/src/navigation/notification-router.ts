import type { NavigationProp } from '@react-navigation/native';

import {
  linkForNotification,
  pushLink,
  pushType,
} from '../shared/notifications/notification-payload';
import { resolveDeepLink, type ResolvedLink } from './deep-links';
import { targetForWebLink } from './notification-web-links';
import type { RootStackParamList } from './param-lists';
import type { TabName } from './tabs';

export { targetForWebLink };

/**
 * Where a notification takes you.
 *
 * `resolveDeepLink` answers "is this payload safe, and what does it name"; this file answers "and
 * does that exist for *this* person". The two are separate because the second one is not a
 * security question: a screen name can be perfectly valid and still be a tab the caller does not
 * have. A support executive has no Tasks tab, and a client has no Notifications tab, so the same
 * trustworthy payload has to land somewhere different for each of them.
 *
 * Navigating to a tab that is not in the bar is not a crash — React Navigation logs that nothing
 * handled the action and leaves the person where they were, which reads as a tap that did
 * nothing. So the target is checked against the tabs the person actually has, and anything that
 * does not fit falls back to their first tab, which is always somewhere real.
 */

/** A detail route: one that cannot be opened without an id. */
export type DetailScreen =
  | 'TaskDetail'
  | 'TicketDetail'
  | 'InvoiceDetail'
  | 'BillingInvoiceDetail'
  | 'ProjectDetail'
  | 'Conversation'
  | 'QaAssignment'
  | 'ApprovalDetail'
  | 'SignOff'
  | 'ReleaseNote'
  | 'ContractDetail'
  | 'PortalContractDetail'
  | 'ChangeRequestDetail'
  | 'PortalChangeRequestDetail'
  | 'ReleaseDetail'
  | 'ProblemDetail'
  | 'IncidentDetail';

/** A stack route that carries nothing. */
type PlainScreen =
  | 'RaiseTicket'
  | 'NotificationPreferences'
  | 'Projects'
  | 'Conversations'
  | 'QaQueue'
  | 'Approvals'
  | 'SignOffs'
  | 'MyTime'
  | 'InternWork'
  | 'CompletedToday'
  | 'SessionLogs'
  | 'SupportQueue'
  | 'EmailSettings'
  | 'WhatsAppSettings';

export type NavigationTarget =
  | { kind: 'tab'; tab: TabName }
  | { kind: 'detail'; screen: DetailScreen; id: string }
  | { kind: 'plain'; screen: PlainScreen }
  /** A project's summary screen, where its phase plan lives on the phone. */
  | { kind: 'summary'; projectId: string };

/** Screen names that are tabs rather than stack routes. */
const TAB_SCREENS = new Set<string>([
  'Home',
  'Tasks',
  'Tickets',
  'Messages',
  'Updates',
  'Notifications',
  'Invoices',
  'Profile',
]);

/**
 * The detail routes an older, screen-naming payload may open.
 *
 * `CompleteTask` is deliberately absent although it takes an id: it is a form you reach from a
 * task you are already reading, not a place to be dropped into by a tap on a lock screen.
 */
const DETAIL_SCREENS: Record<string, DetailScreen> = {
  TaskDetail: 'TaskDetail',
  TicketDetail: 'TicketDetail',
  InvoiceDetail: 'InvoiceDetail',
  ProjectDetail: 'ProjectDetail',
  Conversation: 'Conversation',
  QaAssignment: 'QaAssignment',
  ApprovalDetail: 'ApprovalDetail',
  SignOff: 'SignOff',
  ReleaseNote: 'ReleaseNote',
};

const PLAIN_SCREENS: Record<string, PlainScreen> = {
  RaiseTicket: 'RaiseTicket',
  NotificationPreferences: 'NotificationPreferences',
  Projects: 'Projects',
  Conversations: 'Conversations',
  QaQueue: 'QaQueue',
  Approvals: 'Approvals',
  SignOffs: 'SignOffs',
  MyTime: 'MyTime',
  InternWork: 'InternWork',
  CompletedToday: 'CompletedToday',
  SessionLogs: 'SessionLogs',
  SupportQueue: 'SupportQueue',
};

/**
 * The screen a checked payload should open, for somebody with these tabs.
 *
 * `tabs` is the person's own bar. An empty one only happens before the session has restored, and
 * the caller does not subscribe until then; `Profile` is the last resort because every role has
 * it — signing out lives there.
 */
export function targetFor(link: ResolvedLink, tabs: readonly TabName[]): NavigationTarget {
  const fallback: NavigationTarget = { kind: 'tab', tab: tabs[0] ?? 'Profile' };

  const detail = DETAIL_SCREENS[link.screen];
  if (detail) {
    // `resolveDeepLink` has already refused a detail screen without a UUID, so a missing id here
    // would mean that function changed rather than that a payload got through. Checked anyway: an
    // unvalidated route parameter is exactly what this pair of functions exists to prevent.
    return link.params?.id ? { kind: 'detail', screen: detail, id: link.params.id } : fallback;
  }

  const plain = PLAIN_SCREENS[link.screen];
  if (plain) {
    return { kind: 'plain', screen: plain };
  }

  if (TAB_SCREENS.has(link.screen) && tabs.includes(link.screen as TabName)) {
    return { kind: 'tab', tab: link.screen as TabName };
  }
  return fallback;
}

/** A tab target the person does not have becomes the fallback `targetFor` would choose. */
export function withinTabs(target: NavigationTarget, tabs: readonly TabName[]): NavigationTarget {
  if (target.kind === 'tab' && !tabs.includes(target.tab)) {
    return targetFor({ screen: 'Notifications' }, tabs);
  }
  return target;
}

/**
 * Where a tapped notification goes, from its untrusted `data` block.
 *
 * The API's pushes (`NativePushData`) carry the notification's web `link`, which is translated
 * first — with its type, so a phase-plan alert opens the project summary. Older payloads that
 * name a `screen` go through `resolveDeepLink`. Anything else lands on the alerts list, or the
 * person's first tab when they have no alerts list.
 */
export function targetForPayload(data: unknown, tabs: readonly TabName[]): NavigationTarget {
  const link = linkForNotification(pushLink(data), pushType(data));
  const fromLink = link ? targetForWebLink(link) : null;
  if (fromLink) {
    return withinTabs(fromLink, tabs);
  }
  return targetFor(resolveDeepLink(data), tabs);
}

/** Performs the navigation. Split from the decision above so the decision can be tested alone. */
export function followTarget(
  navigation: NavigationProp<RootStackParamList>,
  target: NavigationTarget,
): void {
  switch (target.kind) {
    case 'tab':
      navigation.navigate('Main', { screen: target.tab });
      return;
    case 'plain':
      navigation.navigate(target.screen);
      return;
    case 'summary':
      navigation.navigate('ProjectSummary', { projectId: target.projectId });
      return;
    default:
      navigation.navigate(target.screen, { id: target.id });
  }
}
