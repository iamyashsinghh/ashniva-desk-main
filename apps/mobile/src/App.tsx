import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from './features/auth/SessionProvider';
import { useBranding } from './features/branding/use-branding';
import { RootNavigator } from './navigation/RootNavigator';
import { ErrorBoundary } from './shared/components/ErrorBoundary';
import { ThemeProvider } from './shared/theme/ThemeProvider';

/**
 * The app.
 *
 * The provider order is deliberate. The query client is outermost of the three that do work,
 * because the branding it fetches decides the theme; the theme is next so the error screen is
 * themed; the error boundary sits below both so a failure anywhere under it — including in the
 * navigator — shows a recoverable screen rather than a white rectangle. The session is innermost
 * because only the navigator needs it.
 *
 * `SafeAreaProvider` wraps everything so no screen has to know about the notch, the home
 * indicator, or a punch-hole camera; they ask for insets and get the right numbers.
 */

/**
 * One client for the app.
 *
 * A phone's connection comes and goes, so a cached answer stays usable for a minute rather than
 * being refetched every time a screen comes back into view. `retry: false` is set per query in
 * `queries.ts`, where the 4xx rule lives.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

/**
 * The theme, with the tenant's accent colour in it.
 *
 * A component rather than an inline hook call, because the branding query has to run below the
 * query client and its result has to be above the theme.
 */
function BrandedTheme({ children }: { children: ReactNode }) {
  const branding = useBranding();
  return <ThemeProvider brandPrimary={branding.colors.primary}>{children}</ThemeProvider>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <BrandedTheme>
          <ErrorBoundary>
            <SessionProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </SessionProvider>
          </ErrorBoundary>
        </BrandedTheme>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
