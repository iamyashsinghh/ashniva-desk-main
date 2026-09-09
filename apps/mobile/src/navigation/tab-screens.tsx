import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, type NavigationProp } from '@react-navigation/native';

import { useSession } from '../features/auth/SessionProvider';
import { HomeScreen } from '../features/home/HomeScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { InvoicesScreen } from '../features/portal/InvoicesScreen';
import { UpdatesScreen } from '../features/portal/UpdatesScreen';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { TasksScreen } from '../features/tasks/TasksScreen';
import { TicketsScreen } from '../features/tickets/TicketsScreen';
import { followTarget, targetForWebLink } from './notification-router';
import type { RootStackParamList, TabParamList } from './param-lists';
import { tabsFor, type TabName } from './tabs';

/**
 * The bottom bar and what is behind each entry.
 *
 * Every screen here reaches the parent stack through `useNavigation` rather than the tab
 * navigator's own `navigation` prop, because the detail screens live on the stack above the tabs.
 */

const Tabs = createBottomTabNavigator<TabParamList>();

export function MainTabs() {
  const { user } = useSession();
  const tabs = user ? tabsFor(user) : [];

  return (
    <Tabs.Navigator screenOptions={{ headerShown: true }}>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarAccessibilityLabel: tab.label,
            // A tab bar with five entries needs room for the labels at large text sizes.
            tabBarLabelStyle: { fontSize: 11 },
          }}
          component={SCREENS[tab.name]}
        />
      ))}
    </Tabs.Navigator>
  );
}

type RootNavigation = NavigationProp<RootStackParamList>;

function useRootNavigation(): RootNavigation {
  return useNavigation<RootNavigation>();
}

function HomeTab() {
  const navigation = useRootNavigation();
  return (
    <HomeScreen
      onOpenProjects={() => navigation.navigate('Projects')}
      onOpenConversations={() => navigation.navigate('Conversations')}
      onOpenQa={() => navigation.navigate('QaQueue')}
      onOpenApprovals={() => navigation.navigate('Approvals')}
      onOpenSignOffs={() => navigation.navigate('SignOffs')}
      onOpenMyTime={() => navigation.navigate('MyTime')}
    />
  );
}

function TasksTab() {
  const navigation = useRootNavigation();
  return <TasksScreen onOpen={(id) => navigation.navigate('TaskDetail', { id })} />;
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
  return <ProfileScreen onOpenPreferences={() => navigation.navigate('NotificationPreferences')} />;
}

/**
 * A lookup of stable components rather than inline arrow functions: an inline component is a new
 * type on every parent render, which remounts the whole tab and loses its scroll position.
 */
const SCREENS: Record<TabName, () => React.JSX.Element | null> = {
  Home: HomeTab,
  Tasks: TasksTab,
  Tickets: TicketsTab,
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
