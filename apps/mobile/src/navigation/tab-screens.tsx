import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';
import { View } from 'react-native';

import { useSession } from '../features/auth/SessionProvider';
import { useCachedUnreadCount } from '../features/notifications/use-cached-unread';
import { Icon, type IconName } from '../shared/components/Icon';
import { useTheme } from '../shared/theme/ThemeProvider';
import { MenuButton } from './drawer/drawer-context';
import { EdgeSwipe } from './drawer/EdgeSwipe';
import { useChatBadge } from './drawer/use-chat-badge';
import type { TabParamList } from './param-lists';
import { TAB_SCREENS } from './tab-contents';
import { barTabsFor, tabsFor, type TabDefinition, type TabName } from './tabs';

/**
 * The bottom bar.
 *
 * Every tab screen the person may be on is registered, but only `barTabsFor` gets a button; the
 * rest are opened from the side menu and keep the bar underneath them. The side menu itself opens
 * from the ☰ button in each tab's header.
 */

const Tabs = createBottomTabNavigator<TabParamList>();

/** Filled for the tab you are on, outlined for the rest. */
const TAB_ICONS: Record<TabName, { active: IconName; inactive: IconName }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Tasks: { active: 'checkbox', inactive: 'checkbox-outline' },
  Tickets: { active: 'ticket', inactive: 'ticket-outline' },
  Messages: { active: 'chatbubbles', inactive: 'chatbubbles-outline' },
  Updates: { active: 'megaphone', inactive: 'megaphone-outline' },
  Notifications: { active: 'notifications', inactive: 'notifications-outline' },
  Invoices: { active: 'receipt', inactive: 'receipt-outline' },
  Profile: { active: 'person-circle', inactive: 'person-circle-outline' },
};

/** Home and You paint their own coloured header where the bar would be. */
const OWN_HEADER = new Set<TabName>(['Home', 'Profile']);

const badgeLabel = (count: number) => (count > 99 ? '99+' : count);

export function MainTabs() {
  const { user } = useSession();
  const theme = useTheme();
  const unread = useCachedUnreadCount();
  const chatUnread = useChatBadge();

  const { registered, onBar } = useMemo(() => {
    if (!user) {
      return { registered: [] as TabDefinition[], onBar: new Set<TabName>() };
    }
    const bar = barTabsFor(user);
    const names = new Set(bar.map((tab) => tab.name));
    const rest = tabsFor(user).filter((tab) => !names.has(tab.name));
    // Bar order first, so the navigator's first route — where a person lands — is Home.
    return { registered: [...bar, ...rest], onBar: names };
  }, [user]);

  const counts: Partial<Record<TabName, number>> = { Notifications: unread, Messages: chatUnread };
  const badgeFor = (name: TabName): number => counts[name] ?? 0;

  // A navigator with no screens throws, and there are none for the moment between signing out
  // and the signed-in stack unmounting.
  if (registered.length === 0) {
    return null;
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: true,
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTitleStyle: { ...theme.typography.heading, color: theme.colors.text },
          headerTitleAlign: 'left',
          headerLeft: () => <MenuButton />,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textFaint,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            paddingTop: 6,
            ...theme.shadow.raised,
          },
          tabBarBadgeStyle: { backgroundColor: theme.colors.danger, fontSize: 11 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        }}
      >
        {registered.map((tab) => {
          const badge = badgeFor(tab.name);
          return (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              component={TAB_SCREENS[tab.name]}
              options={{
                title: tab.label,
                headerShown: !OWN_HEADER.has(tab.name),
                tabBarAccessibilityLabel: tab.label,
                ...(onBar.has(tab.name)
                  ? {}
                  : { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }),
                tabBarIcon: ({ focused, color }) => (
                  <View
                    style={{
                      alignItems: 'center',
                      backgroundColor: focused ? theme.colors.primarySoft : 'transparent',
                      borderRadius: theme.radius.pill,
                      height: 30,
                      justifyContent: 'center',
                      width: 52,
                    }}
                  >
                    <Icon
                      name={focused ? TAB_ICONS[tab.name].active : TAB_ICONS[tab.name].inactive}
                      size={22}
                      color={color}
                    />
                  </View>
                ),
                ...(badge > 0 ? { tabBarBadge: badgeLabel(badge) } : {}),
              }}
            />
          );
        })}
      </Tabs.Navigator>
      <EdgeSwipe />
    </View>
  );
}
