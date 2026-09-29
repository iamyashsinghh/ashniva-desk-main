import { useIsFocused, useNavigation, type NavigationProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

import { useSession } from '../features/auth/SessionProvider';
import {
  canInspectConversations,
  canStartPersonalChat,
  canUseInternalChat,
} from '../features/chat/chat-access';
import { ConversationsScreen } from '../features/chat/ConversationsScreen';
import { HomeScreen } from '../features/home/HomeScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { InvoicesScreen } from '../features/portal/InvoicesScreen';
import { UpdatesScreen } from '../features/portal/UpdatesScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { TicketsScreen } from '../features/tickets/TicketsScreen';
import { useTheme } from '../shared/theme/ThemeProvider';
import { useDrawer } from './drawer/drawer-context';
import { followTarget, targetForWebLink } from './notification-router';
import type { RootStackParamList } from './param-lists';
import type { TabName } from './tabs';

/**
 * What is behind each tab.
 *
 * Every screen here reaches the parent stack through `useNavigation` rather than the tab
 * navigator's own `navigation` prop, because the detail screens live on the stack above the tabs.
 */

type RootNavigation = NavigationProp<RootStackParamList>;

function useRootNavigation(): RootNavigation {
  return useNavigation<RootNavigation>();
}

/** Light status-bar text while a screen with a brand-coloured top is showing. */
function OnBrandStatusBar() {
  const focused = useIsFocused();
  const theme = useTheme();
  return focused ? <StatusBar style={theme.isDark ? 'dark' : 'light'} /> : null;
}

function HomeTab() {
  const navigation = useRootNavigation();
  const drawer = useDrawer();
  return (
    <>
      <OnBrandStatusBar />
      <HomeScreen
        onOpenMenu={drawer.open}
        onOpenProjects={() => navigation.navigate('Projects')}
        onOpenConversations={() => navigation.navigate('Main', { screen: 'Messages' })}
        onOpenQa={() => navigation.navigate('QaQueue')}
        onOpenApprovals={() => navigation.navigate('Approvals')}
        onOpenSignOffs={() => navigation.navigate('SignOffs')}
        onOpenMyTime={() => navigation.navigate('MyTime')}
        onOpenApproval={(id) => navigation.navigate('ApprovalDetail', { id })}
        onOpenTask={(id) => navigation.navigate('TaskDetail', { id })}
        onOpenTasks={() => navigation.navigate('Main', { screen: 'Tasks' })}
        onOpenTicket={(id) => navigation.navigate('TicketDetail', { id })}
        onOpenTickets={() => navigation.navigate('Main', { screen: 'Tickets' })}
        onOpenTaskList={(target) => navigation.navigate('TaskList', target)}
        onOpenTicketList={(target) => navigation.navigate('TicketList', target)}
        onOpenAlerts={() => navigation.navigate('Main', { screen: 'Notifications' })}
        onOpenProfile={() => navigation.navigate('Main', { screen: 'Profile' })}
      />
    </>
  );
}

function TasksTab() {
  const navigation = useRootNavigation();
  return (
    <TasksScreen
      onOpen={(id) => navigation.navigate('TaskDetail', { id })}
      onCreate={() => navigation.navigate('TaskForm')}
    />
  );
}

function TicketsTab() {
  const navigation = useRootNavigation();
  return (
    <TicketsScreen
      onOpen={(id) => navigation.navigate('TicketDetail', { id })}
      onRaise={() => navigation.navigate('RaiseTicket')}
    />
  );
}

function MessagesTab() {
  const navigation = useRootNavigation();
  const { user } = useSession();
  const personal = canStartPersonalChat(user);
  return (
    <ConversationsScreen
      onOpen={(id) => navigation.navigate('Conversation', { id })}
      personalChat={personal}
      canInspect={canInspectConversations(user)}
      {...(personal ? { onStart: () => navigation.navigate('NewConversation') } : {})}
    />
  );
}

function NotificationsTab() {
  const navigation = useRootNavigation();
  return <NotificationsScreen onOpenLink={(link) => openLink(navigation, link)} />;
}

function UpdatesTab() {
  const navigation = useRootNavigation();
  return <UpdatesScreen onOpenRelease={(id) => navigation.navigate('ReleaseNote', { id })} />;
}

function InvoicesTab() {
  const navigation = useRootNavigation();
  return <InvoicesScreen onOpen={(id) => navigation.navigate('InvoiceDetail', { id })} />;
}

function ProfileTab() {
  const navigation = useRootNavigation();
  const drawer = useDrawer();
  const { user } = useSession();
  return (
    <>
      <OnBrandStatusBar />
      <ProfileScreen
        onOpenMenu={drawer.open}
        onOpenPreferences={() => navigation.navigate('NotificationPreferences')}
        onChangePassword={() => navigation.navigate('ChangePassword')}
        // Only somebody with conversations has anything for a wallpaper to be behind.
        {...(canUseInternalChat(user)
          ? { onOpenChatWallpaper: () => navigation.navigate('ChatWallpaper') }
          : {})}
      />
    </>
  );
}

/**
 * A lookup of stable components rather than inline arrow functions: an inline component is a new
 * type on every parent render, which remounts the whole tab and loses its scroll position.
 */
export const TAB_SCREENS: Record<TabName, () => React.JSX.Element | null> = {
  Home: HomeTab,
  Tasks: TasksTab,
  Tickets: TicketsTab,
  Messages: MessagesTab,
  Updates: UpdatesTab,
  Notifications: NotificationsTab,
  Invoices: InvoicesTab,
  Profile: ProfileTab,
};

/**
 * Follows a notification's own link.
 *
 * The API writes web routes (`/tickets/<id>`), which do not all exist here. `targetForWebLink`
 * translates the ones that do; the rest leave the person where they are rather than opening a
 * blank screen.
 */
function openLink(navigation: RootNavigation, link: string): void {
  const target = targetForWebLink(link);
  if (target) {
    followTarget(navigation, target);
  }
}
