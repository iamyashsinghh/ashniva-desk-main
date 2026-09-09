import { DEFAULT_BRANDING, type Branding } from '@ashniva/types';
import type { ColorSchemePreference } from '@ashniva/ui';
import { createContext, useContext } from 'react';

export interface BrandingContextValue {
  branding: Branding;
  /** True while the first request is in flight; the default branding is shown meanwhile. */
  isLoading: boolean;
  /** The person's light/dark choice. `system` follows the operating system, and is the default. */
  colorScheme: ColorSchemePreference;
  /** Changes the scheme and remembers it in this browser. */
  setColorScheme: (preference: ColorSchemePreference) => void;
}

export const BrandingContext = createContext<BrandingContextValue>({
  branding: DEFAULT_BRANDING,
  isLoading: false,
  colorScheme: 'system',
  setColorScheme: () => {},
});

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
