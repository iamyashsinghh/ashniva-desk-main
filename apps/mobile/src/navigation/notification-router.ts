import type { NavigationProp } from '@react-navigation/native';

import type { ResolvedLink } from './deep-links';
import type { RootStackParamList } from './param-lists';
import type { TabName } from './tabs';

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
type DetailScreen =
  | 'TaskDetail'
  | 'TicketDetail'
  | 'InvoiceDetail'
  | 'ProjectDetail'
  | 'Conversation'
  | 'QaAssignment'
  | 'ApprovalDetail'
  | 'SignOff'
  | 'ReleaseNote';

/** A stack route that carries nothing. */
type PlainScreen =
  | 'RaiseTicket'
  | 'NotificationPreferences'
  | 'Projects'
  | 'Conversations'
  | 'QaQueue'
  | 'Approvals'
  | 'SignOffs'
  | 'MyTime';

export type NavigationTarget =
  | { kind: 'tab'; tab: TabName }
  | { kind: 'detail'; screen: DetailScreen; id: string }
  | { kind: 'plain'; screen: PlainScreen };

/** Screen names that are tabs rather than stack routes. */
const TAB_SCREENS = new Set<string>([
  'Home',
  'Tasks',
  'Tickets',
  'Updates',
  'Notifications',
  'Invoices',
  'Profile',
]);

/**
 * The detail routes a notification may open.
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

/** The web paths the API writes into a notification's `link`, and the phone screen for each. */
const WEB_LINKS: ReadonlyArray<{ pattern: RegExp; screen: DetailScreen }> = [
  { pattern: /^\/(?:portal\/)?tickets\/([0-9a-f-]{36})$/i, screen: 'TicketDetail' },
  { pattern: /^\/tasks\/([0-9a-f-]{36})$/i, screen: 'TaskDetail' },
  { pattern: /^\/(?:portal\/)?invoices\/([0-9a-f-]{36})$/i, screen: 'InvoiceDetail' },
  { pattern: /^\/projects\/([0-9a-f-]{36})$/i, screen: 'ProjectDetail' },
  { pattern: /^\/conversations\/([0-9a-f-]{36})$/i, screen: 'Conversation' },
  { pattern: /^\/qa\/assignments\/([0-9a-f-]{36})$/i, screen: 'QaAssignment' },
  // One pattern for both audiences, as with tickets and invoices: the provider's notification
  // links to `/approvals/<id>` and the client's to `/portal/approvals/<id>`, and the screen behind
  // `ApprovalDetail` asks the endpoint for the caller's own side rather than trusting the path.
  { pattern: /^\/(?:portal\/)?approvals\/([0-9a-f-]{36})$/i, screen: 'ApprovalDetail' },
];

/**
 * A notification's own link, as a phone target.
 *
 * The API writes one set of links for both apps and not all of them exist here. Returning null
 * for the rest leaves the person where they are rather than opening a blank screen — and
 * `Notifications` would be a worse answer than null, because they are already standing in it.
 */
export function targetForWebLink(link: string): NavigationTarget | null {
  for (const { pattern, screen } of WEB_LINKS) {
    const id = pattern.exec(link)?.[1];
    if (id) {
      return { kind: 'detail', screen, id };
    }
  }
  return null;
}

/** Performs the navigation. Split from the decision above so the decision can be tested alone. */
export function followTarget(
  navigation: NavigationProp<RootStackParamList>,
  target: NavigationTarget,
): void {
  if (target.kind === 'tab') {
    navigation.navigate('Main', { screen: target.tab });
    return;
  }
  if (target.kind === 'plain') {
    navigation.navigate(target.screen);
    return;
  }
  navigation.navigate(target.screen, { id: target.id });
}
