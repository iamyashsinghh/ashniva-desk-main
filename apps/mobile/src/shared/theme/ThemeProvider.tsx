import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { themeFor, type Theme } from './theme';

/**
 * Theme, from the device setting.
 *
 * The scheme is read rather than stored: the operating system already has the person's answer,
 * and an app that ignores it is an app that is dark when the phone is light.
 *
 * `brandPrimary` comes from the tenant's branding, so the accent colour is not hardcoded. Until
 * branding has loaded it is null and the fallback applies, which is a visible neutral green
 * rather than an invisible transparent.
 */

const ThemeContext = createContext<Theme>(themeFor('light'));

export function ThemeProvider({
  children,
  brandPrimary = null,
}: {
  children: ReactNode;
  brandPrimary?: string | null;
}) {
  const scheme = useColorScheme();
  const theme = useMemo(
    () => themeFor(scheme === 'dark' ? 'dark' : 'light', brandPrimary),
    [scheme, brandPrimary],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
