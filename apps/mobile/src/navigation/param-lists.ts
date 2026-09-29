import type { NavigatorScreenParams } from '@react-navigation/native';

import type { AdminParamList } from './params/admin';
import type { BillingParamList } from './params/billing';
import type { CommercialParamList } from './params/commercial';
import type { InsightsParamList } from './params/insights';
import type { PortalParamList } from './params/portal';
import type { ProblemsParamList } from './params/problems';
import type { ReleasesParamList } from './params/releases';
import type { SearchParamList } from './params/search';
import type { SettingsParamList } from './params/settings';
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
 *
 * Each feature area keeps its own routes in `params/`, so the areas can grow without every change
 * landing in this one file.
 */
export type RootStackParamList = CoreParamList &
  PortalParamList &
  CommercialParamList &
  BillingParamList &
  InsightsParamList &
  ReleasesParamList &
  ProblemsParamList &
  AdminParamList &
  SettingsParamList &
  SearchParamList;

type CoreParamList = {
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

  /** Signed-out only: registered in the sign-in stack, never beside the tabs. */
  ForgotPassword: undefined;
  ResetPassword: { token: string };
  AcceptInvitation: { token: string };

  ChangePassword: undefined;
  /** This device's chat wallpaper; with a conversation, that chat's own or every chat's. */
  ChatWallpaper: { conversationId?: string } | undefined;
  /**
   * A filtered task or ticket list opened from a dashboard tile. `query` is the list endpoint's
   * own query string, so the list shows exactly the rows the tile counted.
   */
  TaskList: { title?: string; query: Record<string, string> };
  TicketList: { title?: string; query: Record<string, string> };
  /** Create (no id) or edit (id) a task; `projectId` preselects the project on create. */
  TaskForm: { id?: string; projectId?: string } | undefined;
  ProjectForm: { id?: string } | undefined;
  ProjectMembers: { id: string };
  ProjectSummary: { projectId: string };
  WorkPlanEditor: { projectId: string };

  /** Work handed to interns, and the form a lead hands it out with. */
  InternWork: undefined;
  InternWorkForm: undefined;
  CompletedToday: undefined;
  /** A team's sign-in, sign-out and break times. */
  SessionLogs: undefined;
  SupportQueue: undefined;
};
