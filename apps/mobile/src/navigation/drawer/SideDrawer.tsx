import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../../features/auth/SessionProvider';
import { useCachedUnreadCount } from '../../features/notifications/use-cached-unread';
import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { duration, easing, useReducedMotion } from '../../shared/theme/motion';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { menuFor, type MenuItem, type MenuRoute, type MenuTarget } from '../menu-items';
import type { RootStackParamList } from '../param-lists';
import { DrawerHeader } from './DrawerHeader';
import { DrawerRow } from './DrawerRow';
import { useChatBadge } from './use-chat-badge';

type RootNavigation = NavigationProp<RootStackParamList>;

/**
 * The side menu, sliding in from the left over whatever is showing.
 *
 * Built on `Modal` and `Animated` rather than a drawer navigator: the drawer navigator needs
 * Reanimated and Gesture Handler as native dependencies, and this menu only has to open, close
 * and navigate. A drag to the left closes it, as it does in every app with one.
 */
export function SideDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(340, Math.round(width * 0.84));
  const { user, signOut } = useSession();
  const navigation = useNavigation<RootNavigation>();
  const reduceMotion = useReducedMotion();
  const alerts = useCachedUnreadCount();
  const chat = useChatBadge();

  const [progress] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  // Mounted as soon as it is asked for; unmounted only once the closing slide has finished.
  if (visible && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    const slide = visible ? duration.slow : duration.base;
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotion ? 0 : slide,
      easing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) {
        setMounted(false);
      }
    });
  }, [visible, progress, reduceMotion]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => progress.setValue(Math.max(0, 1 + g.dx / panelWidth)),
        onPanResponderRelease: (_, g) => {
          if (g.dx < -panelWidth / 3 || g.vx < -0.5) {
            onClose();
          } else {
            Animated.spring(progress, { toValue: 1, useNativeDriver: true }).start();
          }
        },
      }),
    [onClose, panelWidth, progress],
  );

  const sections = useMemo(() => (user ? menuFor(user) : []), [user]);
  if (!user || !mounted) {
    return null;
  }

  const go = (target: MenuTarget) => {
    onClose();
    followMenuTarget(navigation, target);
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need your password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          onClose();
          void signOut();
        },
      },
    ]);
  };

  const counts = { alerts, chat };
  const badgeFor = (item: MenuItem): number => (item.badge ? counts[item.badge] : 0);

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <Animated.View
          style={{
            backgroundColor: theme.colors.background,
            bottom: 0,
            left: 0,
            position: 'absolute',
            top: 0,
            transform: [
              {
                translateX: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-panelWidth, 0],
                }),
              },
            ],
            width: panelWidth,
            zIndex: 2,
            ...theme.shadow.raised,
          }}
          {...pan.panHandlers}
        >
          <DrawerHeader user={user} onOpenProfile={() => go({ kind: 'tab', tab: 'Profile' })} />
          <ScrollView
            contentContainerStyle={{
              paddingBottom: insets.bottom + theme.spacing.lg,
              paddingTop: theme.spacing.sm,
            }}
          >
            {sections.map((section) => (
              <View key={section.heading} style={{ paddingTop: theme.spacing.md }}>
                <AppText
                  size="xs"
                  weight="bold"
                  tone="faint"
                  uppercase
                  style={{
                    letterSpacing: 0.6,
                    paddingBottom: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.lg,
                  }}
                >
                  {section.heading}
                </AppText>
                {section.items.map((item) => (
                  <DrawerRow
                    key={item.key}
                    item={item}
                    badge={badgeFor(item)}
                    onPress={() => go(item.target)}
                  />
                ))}
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={confirmSignOut}
              style={({ pressed }) => ({
                alignItems: 'center',
                flexDirection: 'row',
                gap: theme.spacing.md,
                marginHorizontal: theme.spacing.lg,
                marginTop: theme.spacing.lg,
                opacity: pressed ? 0.6 : 1,
                paddingVertical: theme.spacing.md,
              })}
            >
              <Icon name="log-out-outline" size={20} color={theme.colors.danger} />
              <AppText weight="bold" tone="danger">
                Sign out
              </AppText>
            </Pressable>
          </ScrollView>
        </Animated.View>
        <Animated.View
          style={{
            backgroundColor: theme.colors.overlay,
            flex: 1,
            opacity: progress,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={{ flex: 1 }}
            onPress={onClose}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Performs a menu entry's navigation. Tabs open in place, with the bar still underneath. */
export function followMenuTarget(navigation: RootNavigation, target: MenuTarget): void {
  switch (target.kind) {
    case 'tab':
      navigation.navigate('Main', { screen: target.tab });
      return;
    case 'taskList':
      navigation.navigate('TaskList', { title: target.title, query: target.query });
      return;
    default:
      openRoute(navigation, target.screen);
  }
}

/**
 * `navigate` for a route that takes no parameters. The cast is only about the compiler: past a
 * couple of dozen names TypeScript stops matching a union of route names against the overloads
 * one by one, and every name `MenuRoute` admits is typed there as taking nothing.
 */
function openRoute(navigation: RootNavigation, screen: MenuRoute): void {
  (navigation.navigate as (this: RootNavigation, name: MenuRoute) => void).call(navigation, screen);
}
