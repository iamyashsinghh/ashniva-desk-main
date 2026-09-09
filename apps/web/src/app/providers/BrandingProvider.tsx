import { DEFAULT_BRANDING } from '@ashniva/types';
import { applyTheme, type ColorSchemePreference } from '@ashniva/ui';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useBrandingQuery } from '../../features/branding/api';
import { BrandingContext } from './branding-context';
import { readColorSchemePreference, writeColorSchemePreference } from './color-scheme-preference';

/**
 * Loads the organization's branding from the API and writes it into the CSS variables that every
 * component uses. Falls back to the approved default branding when the API is unreachable, so the
 * app never renders unstyled.
 *
 * The colour scheme is applied from here rather than from the control that changes it, because
 * the two are not independent: a tenant's theme is written as inline custom properties on the
 * root, and an inline property beats every stylesheet rule — so a light `--color-surface` applied
 * at sign-in would paint white cards onto a dark page. `applyTheme` sets the scheme first and
 * re-applies branding into it, which is the only order that leaves the document correct whichever
 * of the two changed.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useBrandingQuery();
  const branding = data ?? DEFAULT_BRANDING;
  const [colorScheme, setStoredScheme] = useState<ColorSchemePreference>(readColorSchemePreference);

  useEffect(() => {
    applyTheme(branding, colorScheme);
    document.title = branding.productName;
  }, [branding, colorScheme]);

  // The OS preference can change while the app is open — a phone switching at dusk, a desktop on
  // a schedule — and `system` means "follow it", not "follow it once".
  useEffect(() => {
    if (colorScheme !== 'system' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme(branding, 'system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [branding, colorScheme]);

  const setColorScheme = useCallback((preference: ColorSchemePreference) => {
    writeColorSchemePreference(preference);
    setStoredScheme(preference);
  }, []);

  const value = useMemo(
    () => ({ branding, isLoading, colorScheme, setColorScheme }),
    [branding, isLoading, colorScheme, setColorScheme],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
