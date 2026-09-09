import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './param-lists';
import { MOBILE_SCREENS } from './tabs';

/**
 * Deep links.
 *
 * Two ways in: the app's own scheme (`ashnivadesk://tickets/123`) and an https link to the web
 * app, so a link in an email opens the app when it is installed and the site when it is not.
 *
 * Every path maps to a screen the phone actually has. A notification about something that lives
 * only on the desktop opens the app rather than a dead route — `resolveDeepLink` says which.
 */

export const DEEP_LINK_PREFIXES = ['ashnivadesk://', 'https://app.ashniva.example'];

export const linkingConfig: NonNullable<LinkingOptions<RootStackParamList>['config']> = {
  screens: {
    Main: {
      screens: {
        Home: 'home',
        Tasks: 'tasks',
        Tickets: 'tickets',
        Notifications: 'notifications',
        Updates: 'updates',
        Invoices: 'invoices',
        Profile: 'profile',
      },
    },
    TaskDetail: 'tasks/:id',
    TicketDetail: 'tickets/:id',
    RaiseTicket: 'tickets/new',
    InvoiceDetail: 'invoices/:id',
    NotificationPreferences: 'profile/notifications',
    Projects: 'projects',
    ProjectDetail: 'projects/:id',
    Conversations: 'conversations',
    Conversation: 'conversations/:id',
    NewConversation: 'conversations/new',
    ConversationGroup: 'conversations/:id/group',
    QaQueue: 'qa',
    QaAssignment: 'qa/assignments/:id',
    Approvals: 'approvals',
    ApprovalDetail: 'approvals/:id',
    SignOffs: 'uat',
    SignOff: 'uat/:id',
    MyTime: 'my-time',
    ReleaseNote: 'release-notes/:id',
  },
};

export interface ResolvedLink {
  screen: string;
  params?: Record<string, string>;
}

/** Screens that cannot be opened without an id. Navigating to one without it is a blank page. */
const NEEDS_ID = new Set([
  'TaskDetail',
  'CompleteTask',
  'TicketDetail',
  'InvoiceDetail',
  'ProjectDetail',
  'Conversation',
  'ConversationGroup',
  'QaAssignment',
  'ApprovalDetail',
  'SignOff',
  'ReleaseNote',
]);

/**
 * Turns a notification payload into a screen.
 *
 * Payloads arrive from a push service, which means they are attacker-influenced in the same way
 * any inbound message is: the screen name is checked against the known list rather than trusted,
 * and an id must look like a UUID before it is passed to a route. An unrecognised payload opens
 * the notifications list, which is always a reasonable place to be.
 */
export function resolveDeepLink(data: unknown): ResolvedLink {
  const fallback: ResolvedLink = { screen: 'Notifications' };
  if (typeof data !== 'object' || data === null) {
    return fallback;
  }

  const payload = data as Record<string, unknown>;
  const screen = typeof payload.screen === 'string' ? payload.screen : null;
  if (!screen || !MOBILE_SCREENS.has(screen)) {
    return fallback;
  }

  const id = typeof payload.id === 'string' && isUuid(payload.id) ? payload.id : null;
  // Both directions matter. A detail screen with no usable id is a blank page, and an id that is
  // present but malformed is a route parameter nobody validated.
  if (NEEDS_ID.has(screen) && !id) {
    return fallback;
  }
  if (typeof payload.id === 'string' && payload.id !== '' && !id) {
    return fallback;
  }

  return id ? { screen, params: { id } } : { screen };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID.test(value);
}
