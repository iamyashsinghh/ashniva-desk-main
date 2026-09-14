import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { ApprovalDetailScreen, ApprovalsScreen } from '../features/approvals/ApprovalsScreen';
import { useSession } from '../features/auth/SessionProvider';
import { canStartPersonalChat, canUseInternalChat } from '../features/chat/chat-access';
import { ConversationScreen } from '../features/chat/ConversationScreen';
import { ConversationsScreen } from '../features/chat/ConversationsScreen';
import { GroupScreen } from '../features/chat/GroupScreen';
import { NewConversationScreen } from '../features/chat/NewConversationScreen';
import { InvoiceDetailScreen } from '../features/portal/InvoiceDetailScreen';
import { ReleaseNoteScreen } from '../features/portal/ReleaseNoteScreen';
import { NotificationPreferencesScreen } from '../features/profile/NotificationPreferencesScreen';
import { ProjectDetailScreen } from '../features/projects/ProjectDetailScreen';
import { ProjectsScreen } from '../features/projects/ProjectsScreen';
import { QaAssignmentScreen } from '../features/qa/QaAssignmentScreen';
import { QaQueueScreen } from '../features/qa/QaQueueScreen';
import { CompleteTaskScreen } from '../features/tasks/CompleteTaskScreen';
import { TaskDetailScreen } from '../features/tasks/TaskDetailScreen';
import { RaiseTicketScreen } from '../features/tickets/RaiseTicketScreen';
import { TicketDetailScreen } from '../features/tickets/TicketDetailScreen';
import { SignOffScreen } from '../features/uat/SignOffScreen';
import { SignOffsScreen } from '../features/uat/SignOffsScreen';
import { MyTimeScreen } from '../features/work/MyTimeScreen';
import type { RootStackParamList } from './param-lists';
import { MainTabs } from './tab-screens';
import { tabsFor } from './tabs';
import { useNotificationTaps } from './use-notification-taps';

/**
 * Everything reachable once somebody is signed in.
 *
 * The tab bar is one route on this stack; the rest are the screens you push on top of it. Some of
 * them — Projects, messages, the testing queue — are list screens that would be tabs if the bar
 * had room. It is capped at five and none of them is worth what it would displace, so they are
 * opened from Home. See `tabs.ts`.
 *
 * A component of its own so `useNotificationTaps` can call `useNavigation`, which needs a
 * container above it, and so the subscription exists only while somebody is signed in: a
 * notification tap arriving at the sign-in screen has nowhere to go.
 */

const Stack = createNativeStackNavigator<RootStackParamList>();

export function SignedInStack() {
  const { user } = useSession();
  const tabs = useMemo(() => (user ? tabsFor(user).map((tab) => tab.name) : []), [user]);
  const openChat = useChatNavigation();

  useNotificationTaps(tabs);

  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="TaskDetail"
        options={{ title: 'Task' }}
        children={({ route, navigation }) => (
          <TaskDetailScreen
            taskId={route.params.id}
            onComplete={(id) => navigation.navigate('CompleteTask', { id })}
            onOpenChat={openChat}
          />
        )}
      />
      <Stack.Screen
        name="CompleteTask"
        options={{ title: 'Send for review' }}
        children={({ route, navigation }) => (
          <CompleteTaskScreen taskId={route.params.id} onDone={() => navigation.goBack()} />
        )}
      />
      <Stack.Screen
        name="TicketDetail"
        options={{ title: 'Ticket' }}
        children={({ route }) => (
          <TicketDetailScreen ticketId={route.params.id} onOpenChat={openChat} />
        )}
      />
      <Stack.Screen
        name="RaiseTicket"
        options={{ title: 'Raise a ticket' }}
        children={({ navigation }) => (
          <RaiseTicketScreen onRaised={(id) => navigation.replace('TicketDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="InvoiceDetail"
        options={{ title: 'Invoice' }}
        children={({ route }) => <InvoiceDetailScreen invoiceId={route.params.id} />}
      />
      <Stack.Screen
        name="NotificationPreferences"
        options={{ title: 'Notification settings' }}
        component={NotificationPreferencesScreen}
      />
      <Stack.Screen
        name="Projects"
        options={{ title: 'Projects' }}
        children={({ navigation }) => (
          <ProjectsScreen onOpen={(id) => navigation.navigate('ProjectDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ProjectDetail"
        options={{ title: 'Project' }}
        children={({ route }) => (
          <ProjectDetailScreen projectId={route.params.id} onOpenChat={openChat} />
        )}
      />
      <Stack.Screen
        name="Conversations"
        options={{ title: 'Messages' }}
        children={({ navigation }) => (
            <ConversationsScreen
            onOpen={(id) => navigation.navigate('Conversation', { id })}
            personalChat={canStartPersonalChat(user)}
            // Null rather than a button that fails: a client has no internal conversations
            // anywhere in the system, and the API refuses them at the first check of every route.
            {...(canStartPersonalChat(user) ? { onStart: () => navigation.navigate('NewConversation') } : {})}
          />
        )}
      />
      <Stack.Screen
        name="Conversation"
        options={{ title: 'Conversation' }}
        children={({ route, navigation }) => (
          <ConversationScreen
            conversationId={route.params.id}
            onOpenGroup={(id) => navigation.navigate('ConversationGroup', { id })}
          />
        )}
      />
      <Stack.Screen
        name="NewConversation"
        options={{ title: 'Start a conversation' }}
        children={({ navigation }) => (
          <NewConversationScreen onOpened={(id) => navigation.replace('Conversation', { id })} />
        )}
      />
      <Stack.Screen
        name="ConversationGroup"
        options={{ title: 'Group' }}
        children={({ route, navigation }) => (
          <GroupScreen
            conversationId={route.params.id}
            // Back past the thread as well: somebody who has left a group reads nothing in it
            // from the next request onwards, so returning to it would land on a refusal.
            onLeft={() => navigation.navigate('Conversations')}
          />
        )}
      />
      <Stack.Screen
        name="QaQueue"
        options={{ title: 'Testing' }}
        children={({ navigation }) => (
          <QaQueueScreen onOpen={(id) => navigation.navigate('QaAssignment', { id })} />
        )}
      />
      <Stack.Screen
        name="QaAssignment"
        options={{ title: 'Assignment' }}
        children={({ route }) => <QaAssignmentScreen assignmentId={route.params.id} />}
      />
      <Stack.Screen
        name="Approvals"
        options={{ title: 'Approvals' }}
        children={({ navigation }) => (
          <ApprovalsScreen onOpen={(id) => navigation.navigate('ApprovalDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ApprovalDetail"
        options={{ title: 'Approval request' }}
        children={({ route }) => <ApprovalDetailScreen approvalId={route.params.id} />}
      />
      <Stack.Screen
        name="SignOffs"
        options={{ title: 'Sign-offs' }}
        children={({ navigation }) => (
          <SignOffsScreen onOpen={(id) => navigation.navigate('SignOff', { id })} />
        )}
      />
      <Stack.Screen
        name="SignOff"
        options={{ title: 'Sign-off' }}
        children={({ route }) => <SignOffScreen requestId={route.params.id} />}
      />
      <Stack.Screen
        name="MyTime"
        options={{ title: 'My time' }}
        children={({ navigation }) => (
          <MyTimeScreen onOpenTask={(id) => navigation.navigate('TaskDetail', { id })} />
        )}
      />
      <Stack.Screen
        name="ReleaseNote"
        options={{ title: 'Release' }}
        children={({ route }) => <ReleaseNoteScreen releaseId={route.params.id} />}
      />
    </Stack.Navigator>
  );
}

/**
 * How a screen opens a conversation, or null when this person has none.
 *
 * Null rather than a callback that fails: a client has no internal conversations anywhere in the
 * system, and offering them a button that answers 403 would be worse than not offering one. The
 * API refuses them at the first check of every route on that controller regardless.
 */
function useChatNavigation(): ((conversationId: string) => void) | null {
  const { user } = useSession();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  return useMemo(
    () =>
      canUseInternalChat(user)
        ? (conversationId: string) => navigation.navigate('Conversation', { id: conversationId })
        : null,
    [user, navigation],
  );
}
