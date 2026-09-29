import { NavigationContext, type NavigationProp } from '@react-navigation/native';
import { useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { RootStackParamList } from '../../navigation/param-lists';
import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { openQuickCreate, quickCreateActions } from './quick-create';
import { QuickCreateSheet } from './QuickCreateSheet';

/**
 * The ways into search and quick create from the brand-coloured headers (Home, the side menu).
 *
 * Both reach for the navigator themselves rather than asking their screen for a callback, so the
 * headers can offer them without every screen that hosts a header wiring the same two routes.
 */

type RootNavigation = NavigationProp<RootStackParamList>;

/**
 * The navigator, or null when there is none above — Home is rendered on its own in tests and
 * previews, and an entry point with nowhere to go is left out rather than thrown over.
 */
export function useOptionalRootNavigation(): RootNavigation | null {
  // The context is typed for any navigator; Home's is the tab navigator, which hands a route it
  // does not know up to the root stack.
  return (useContext(NavigationContext) as RootNavigation | undefined) ?? null;
}

/**
 * The "+" menu's state and sheet for whoever draws the button. `available` is false when this
 * person may create nothing, and then the button should not be drawn at all.
 */
export function useQuickCreate(navigation: RootNavigation | null): {
  available: boolean;
  open: () => void;
  sheet: ReactNode;
} {
  const { user, can } = useSession();
  const [visible, setVisible] = useState(false);
  const actions = navigation ? quickCreateActions(user, can) : [];

  const sheet =
    navigation && actions.length > 0 ? (
      <QuickCreateSheet
        visible={visible}
        actions={actions}
        onClose={() => setVisible(false)}
        onSelect={(route) => {
          setVisible(false);
          openQuickCreate(navigation, route);
        }}
      />
    ) : null;

  return { available: actions.length > 0, open: () => setVisible(true), sheet };
}

/**
 * A search field drawn on the brand colour, which is a button: it opens the search screen, where
 * the real field takes the keyboard. Typing into a header that scrolls away would lose the
 * results under the fold.
 */
export function BrandSearchField({
  onPress,
  placeholder = 'Search tasks, tickets, projects…',
}: {
  onPress: () => void;
  placeholder?: string;
}) {
  const theme = useTheme();
  const ink = theme.colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Search"
      accessibilityHint="Opens search"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        minHeight: TOUCH_TARGET,
        opacity: pressed ? 0.75 : 1,
        overflow: 'hidden',
        paddingHorizontal: theme.spacing.md,
      })}
    >
      <InkWash opacity={0.16} />
      <Icon name="search" size={18} color={ink} />
      <AppText size="sm" numberOfLines={1} style={{ color: ink, flex: 1, opacity: 0.85 }}>
        {placeholder}
      </AppText>
    </Pressable>
  );
}

/**
 * A see-through layer of the text colour over the brand colour. Derived from the theme rather
 * than a fixed white, so it stays visible when a tenant's brand, or dark mode, puts dark text on
 * a light primary.
 */
export function InkWash({ opacity }: { opacity: number }) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.primaryText, opacity }]}
    />
  );
}
