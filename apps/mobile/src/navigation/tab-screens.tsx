import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, type NavigationProp } from '@react-navigation/native';

import { useSession } from '../features/auth/SessionProvider';
import { useCachedUnreadCount } from '../features/notifications/use-cached-unread';
import { HomeScreen } from '../features/home/HomeScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { ChamferTile } from '../shared/components/glyph';
import { useTheme } from '../shared/theme/ThemeProvider';
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
  const theme = useTheme();
  const unread = useCachedUnreadCount();
  const tabs = user ? tabsFor(user) : [];

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.colors.background },
        headerTitleStyle: { ...theme.typography.heading, color: theme.colors.text },
        headerTitleAlign: 'left',
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
        tabBarBadgeStyle: { backgroundColor: theme.colors.danger, fontSize: 11 },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.label,
            tabBarAccessibilityLabel: tab.label,
            // A tab bar with five entries needs room for the labels at large text sizes.
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            // The brand's chamfered tile, filled for the tab you are on: the mark is the only
            // picture the app carries, so the tabs speak its language rather than an icon set's.
            tabBarIcon: ({ focused, color }) => (
              <ChamferTile
                label={tab.label.charAt(0)}
                size={24}
                background={focused ? theme.colors.primary : theme.colors.surfaceSunken}
                color={focused ? theme.colors.primaryText : color}
                cutColor={theme.colors.surface}
              />
            ),
            ...(tab.name === 'Notifications' && unread > 0
              ? { tabBarBadge: unread > 99 ? '99+' : unread }
              : {}),
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
