import { isClientRole } from '@ashniva/types';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useMemo } from 'react';

import { useTheme } from '../shared/theme/ThemeProvider';

import { ApprovalDetailScreen, ApprovalsScreen } from '../features/approvals/ApprovalsScreen';
import { useSession } from '../features/auth/SessionProvider';
import { canUseInternalChat } from '../features/chat/chat-access';
import { ChatWallpaperScreen } from '../features/chat-wallpaper/ChatWallpaperScreen';
import { LiveMessageToasts } from '../features/chat/LiveMessageToasts';
import { PushBootstrap } from '../features/notifications/PushBootstrap';
import { InvoiceDetailScreen } from '../features/portal/InvoiceDetailScreen';
import { ReleaseNoteScreen } from '../features/portal/ReleaseNoteScreen';
import { ChangePasswordScreen } from '../features/profile/ChangePasswordScreen';
import { NotificationPreferencesScreen } from '../features/profile/NotificationPreferencesScreen';
import { QaAssignmentScreen } from '../features/qa/QaAssignmentScreen';
import { QaQueueScreen } from '../features/qa/QaQueueScreen';
import { SignOffScreen } from '../features/uat/SignOffScreen';
import { SignOffsScreen } from '../features/uat/SignOffsScreen';
import { MyTimeScreen } from '../features/work/MyTimeScreen';
import { adminRoutes } from './admin-routes';
import { billingRoutes } from './billing-routes';
import { chatRoutes } from './chat-routes';
import { commercialRoutes } from './commercial-routes';
import { DrawerProvider } from './drawer/drawer-context';
import { insightsRoutes } from './insights-routes';
import type { RootStackParamList } from './param-lists';
import { portalRoutes } from './portal-routes';
import { problemRoutes } from './problem-routes';
import { projectRoutes } from './project-routes';
import { releaseRoutes } from './release-routes';
import { searchRoutes } from './search-routes';
import { settingsRoutes } from './settings-routes';
import { taskRoutes, ticketRoutes } from './task-routes';
import { MainTabs } from './tab-screens';
import { tabsFor } from './tabs';
import { useNotificationTaps } from './use-notification-taps';
import { workRoutes } from './work-routes';

/**
 * Everything reachable once somebody is signed in.
 *
 * The tab bar is one route on this stack; the rest are the screens you push on top of it. Most
 * list screens — Projects, approvals, the testing queue, the support queue — are opened from the
 * side menu, which lives here so it can reach every route. See `tabs.ts` and `menu-items.ts`.
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
  const isInternal = Boolean(user && !isClientRole(user.roleKey));

  const theme = useTheme();

  useNotificationTaps(tabs);

  return (
    <DrawerProvider>
      <PushBootstrap />
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTitleStyle: { ...theme.typography.heading, color: theme.colors.text },
          headerTintColor: theme.colors.primary,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        {taskRoutes(Stack, openChat)}
        {ticketRoutes(Stack, openChat)}
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
          name="ChangePassword"
          options={{ title: 'Change password' }}
          children={({ navigation }) => <ChangePasswordScreen onDone={() => navigation.goBack()} />}
        />
        <Stack.Screen
          name="ChatWallpaper"
          options={{ title: 'Chat wallpaper' }}
          children={({ route }) => (
            <ChatWallpaperScreen
              {...(route.params?.conversationId
                ? { conversationId: route.params.conversationId }
                : {})}
            />
          )}
        />
        {projectRoutes(Stack, openChat)}
        {workRoutes(Stack)}
        {chatRoutes(Stack, user)}
        {portalRoutes(Stack)}
        {commercialRoutes(Stack)}
        {billingRoutes(Stack)}
        {insightsRoutes(Stack)}
        {releaseRoutes(Stack)}
        {problemRoutes(Stack)}
        {adminRoutes(Stack)}
        {settingsRoutes(Stack)}
        {searchRoutes(Stack)}
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
          children={({ route, navigation }) => (
            <QaAssignmentScreen
              assignmentId={route.params.id}
              onOpenProject={(id) => navigation.navigate('ProjectDetail', { id })}
            />
          )}
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
          children={({ route, navigation }) => (
            <ApprovalDetailScreen
              approvalId={route.params.id}
              onOpenProject={(id: string) =>
                isInternal
                  ? navigation.navigate('ProjectDetail', { id })
                  : navigation.navigate('PortalProjectDetail', { id })
              }
            />
          )}
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
      {/* After the navigator, so the cards draw over whichever screen is showing. */}
      {openChat ? <LiveMessageToasts onOpenConversation={openChat} /> : null}
    </DrawerProvider>
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
