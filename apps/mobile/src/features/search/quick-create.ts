import { PERMISSIONS, type PermissionKey, type SessionUser } from '@ashniva/types';
import type { NavigationProp } from '@react-navigation/native';

import type { IconName, IconTone } from '../../shared/components/Icon';
import type { RootStackParamList } from '../../navigation/param-lists';
import { isProviderUser } from '../auth/audience';
import { canStartPersonalChat } from '../chat/chat-access';
import { mayAssignInternWork } from '../intern-work/intern-work';

/**
 * What the "+" offers, and to whom.
 *
 * Each action carries the same check as the web control that starts the same thing — the
 * topbar's "+ New task" and "+ Ticket", and the create buttons on the Projects, Messages, Intern
 * work, Invoices and Change requests pages — so the phone offers nobody a door the web keeps shut.
 * None of this is the control: the API refuses every create it does not allow.
 *
 * Incidents and releases are not here because the web has no create button for either on its
 * lists; they start from a problem and from a project's delivery work.
 */

export type QuickCreateRoute =
  | 'TaskForm'
  | 'RaiseTicket'
  | 'ProjectForm'
  | 'NewConversation'
  | 'InternWorkForm'
  | 'InvoiceEditor'
  | 'ChangeRequestForm';

export interface QuickCreateAction {
  key: string;
  label: string;
  description: string;
  icon: IconName;
  tone: IconTone;
  route: QuickCreateRoute;
}

export function quickCreateActions(
  user: SessionUser | null,
  can: (permission: PermissionKey) => boolean,
): QuickCreateAction[] {
  if (!user) {
    return [];
  }
  const provider = isProviderUser(user);
  const actions: QuickCreateAction[] = [];

  if (provider && can(PERMISSIONS.TASK_CREATE)) {
    actions.push({
      key: 'task',
      label: 'New task',
      description: 'Plan a piece of work on a project and hand it to someone.',
      icon: 'checkbox-outline',
      tone: 'primary',
      route: 'TaskForm',
    });
  }
  // The only action the portal's topbar offers a client, and it files under their own company.
  if (can(PERMISSIONS.TICKET_RAISE)) {
    actions.push({
      key: 'ticket',
      label: 'Raise a ticket',
      description: provider
        ? 'Log a support request for a client.'
        : 'Tell the team about a problem or ask for help.',
      icon: 'ticket-outline',
      tone: 'info',
      route: 'RaiseTicket',
    });
  }
  if (!provider) {
    return actions;
  }
  if (can(PERMISSIONS.PROJECT_MANAGE)) {
    actions.push({
      key: 'project',
      label: 'New project',
      description: 'Set up a project with its client, manager and dates.',
      icon: 'folder-open-outline',
      tone: 'teal',
      route: 'ProjectForm',
    });
  }
  // The web offers "Start a conversation" only with personal chat; everybody else has team groups.
  if (canStartPersonalChat(user)) {
    actions.push({
      key: 'conversation',
      label: 'New message or group',
      description: 'Message a colleague directly, or start a group.',
      icon: 'chatbubbles-outline',
      tone: 'violet',
      route: 'NewConversation',
    });
  }
  if (mayAssignInternWork(user, can)) {
    actions.push({
      key: 'intern-work',
      label: 'Assign intern work',
      description: 'Give an intern a clear, time-boxed piece of learning work.',
      icon: 'school-outline',
      tone: 'orange',
      route: 'InternWorkForm',
    });
  }
  if (can(PERMISSIONS.INVOICE_WRITE)) {
    actions.push({
      key: 'invoice',
      label: 'New invoice',
      description: 'Draft an invoice for a client, a milestone or a change request.',
      icon: 'receipt-outline',
      tone: 'success',
      route: 'InvoiceEditor',
    });
  }
  if (can(PERMISSIONS.CHANGE_REQUEST_RAISE)) {
    actions.push({
      key: 'change-request',
      label: 'Raise a change request',
      description: 'Record new scope a client has asked for, before it is estimated.',
      icon: 'git-pull-request-outline',
      tone: 'pink',
      route: 'ChangeRequestForm',
    });
  }
  return actions;
}

/**
 * `navigate` for a route that takes no parameters. The cast is only about the compiler: every
 * name `QuickCreateRoute` admits is typed as accepting `undefined`, but TypeScript does not match
 * a union of names against `navigate`'s overloads one by one.
 */
export function openQuickCreate(
  navigation: NavigationProp<RootStackParamList>,
  route: QuickCreateRoute,
): void {
  (
    navigation.navigate as (
      this: NavigationProp<RootStackParamList>,
      name: QuickCreateRoute,
    ) => void
  ).call(navigation, route);
}
