import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Pressable } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { SideDrawer } from './SideDrawer';

interface DrawerControls {
  open: () => void;
  close: () => void;
}

const DrawerContext = createContext<DrawerControls>({
  open: () => undefined,
  close: () => undefined,
});

/**
 * Owns the side menu's open state, so a header button, Home's own header and the edge swipe can
 * all open the same menu. Mounted inside the navigation container because the menu navigates.
 */
export function DrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const controls = useMemo(() => ({ open, close }), [open, close]);

  return (
    <DrawerContext.Provider value={controls}>
      {children}
      <SideDrawer visible={visible} onClose={close} />
    </DrawerContext.Provider>
  );
}

export function useDrawer(): DrawerControls {
  return useContext(DrawerContext);
}

/** The three-line button at the left of a header. `tint` suits a brand-coloured header. */
export function MenuButton({ tint }: { tint?: string }) {
  const theme = useTheme();
  const { open } = useDrawer();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      hitSlop={10}
      onPress={open}
      style={({ pressed }) => ({
        marginLeft: theme.spacing.md,
        opacity: pressed ? 0.6 : 1,
        padding: 4,
      })}
    >
      <Icon name="menu" size={24} color={tint ?? theme.colors.text} />
    </Pressable>
  );
}
