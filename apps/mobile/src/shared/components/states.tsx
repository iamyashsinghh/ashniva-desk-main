import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useNetworkStatus } from '../hooks/use-network-status';
import { useTheme } from '../theme/ThemeProvider';
import { AppText, Button, Screen } from './primitives';

/**
 * Loading, empty and error, in one place.
 *
 * Every list screen shows all three, and writing them once means none of them is the one that got
 * forgotten. The error state distinguishes "the network is down" from "the server said no",
 * because the first is worth retrying and the second usually is not.
 */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={{ alignItems: 'center', flex: 1, gap: theme.spacing.md, justifyContent: 'center' }}
    >
      <ActivityIndicator color={theme.colors.primary} size="large" />
      <AppText tone="muted">{label}</AppText>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxl,
      }}
    >
      <AppText size="lg" weight="medium">
        {title}
      </AppText>
      {description ? <AppText tone="muted">{description}</AppText> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  offline = false,
}: {
  message: string;
  onRetry?: () => void;
  offline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxl,
      }}
    >
      <AppText size="lg" weight="medium">
        {offline ? 'You are offline' : 'That did not work'}
      </AppText>
      <AppText tone="muted">{message}</AppText>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** A thin bar at the top of the app while the device has no usable connection. */
export function OfflineBanner() {
  const theme = useTheme();
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: theme.colors.warning,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <AppText size="sm">Offline — showing what was last loaded</AppText>
    </View>
  );
}

/** Picks between the three states so a screen does not repeat the same conditional. */
export function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong';
    return (
      <ErrorState
        message={message}
        onRetry={onRetry}
        offline={error instanceof Error && error.name === 'NetworkError'}
      />
    );
  }
  if (isEmpty) {
    return <EmptyState title={emptyTitle ?? 'Nothing here'} description={emptyDescription} />;
  }
  return <>{children}</>;
}

/** The splash screen, shown while the stored session is being checked. */
export function SplashScreen() {
  return (
    <Screen>
      <LoadingState label="Restoring your session" />
    </Screen>
  );
}
