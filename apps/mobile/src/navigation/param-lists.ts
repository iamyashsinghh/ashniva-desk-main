import type { NavigatorScreenParams } from '@react-navigation/native';

import type { TabName } from './tabs';

/**
 * The routes and what each one carries.
 *
 * Typed rather than left as `any`, so a navigation call with the wrong id — or with no id at all
 * — is a compile error rather than a blank screen on somebody's phone.
 */

export type TabParamList = {
  [K in TabName]: undefined;
};

/**
 * A type alias, not an interface, and that matters: React Navigation's `ParamListBase` is
 * `Record<string, object | undefined>`, which an object type alias satisfies through an implicit
 * index signature and an interface does not.
 *
 * Everything below `Main` is a stack route rather than a tab. Some of them — Projects, messages,
 * the testing queue — are list screens that would be tabs if the bar had room; it does not, so
 * they are reached from Home. See `tabs.ts`.
 */
export type RootStackParamList = {
  Main: NavigatorScreenParams<TabParamList> | undefined;
  TaskDetail: { id: string };
  CompleteTask: { id: string };
  TicketDetail: { id: string };
  RaiseTicket: undefined;
  InvoiceDetail: { id: string };
  NotificationPreferences: undefined;
  Projects: undefined;
  ProjectDetail: { id: string };
  Conversations: undefined;
  Conversation: { id: string };
  /** Starting a direct message or a group — the only conversations not opened from their subject. */
  NewConversation: undefined;
  /** A group's name and members. Its own route because a phone has one column. */
  ConversationGroup: { id: string };
  QaQueue: undefined;
  QaAssignment: { id: string };
  Approvals: undefined;
  ApprovalDetail: { id: string };
  SignOffs: undefined;
  SignOff: { id: string };
  MyTime: undefined;
  ReleaseNote: { id: string };
};
