import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useNetworkStatus } from '../hooks/use-network-status';
import { useTheme } from '../theme/ThemeProvider';
import { BrandMark } from './brand';
import { SkeletonList } from './feedback';
import { ChamferTile } from './glyph';
import { AppText, Button, Screen } from './primitives';

/**
 * Loading, empty and error, in one place.
 *
 * Every list screen shows all three, and writing them once means none of them is the one that got
 * forgotten. The error state distinguishes "the network is down" from "the server said no",
 * because the first is worth retrying and the second usually is not.
 */

/**
 * The first load.
 *
 * The shape of the content, pulsing, rather than a spinner on an empty page: the screen looks
 * like itself from the first frame and nothing jumps when the data lands. The label is still
 * announced, so a screen reader hears what is happening.
 */
export function LoadingState({
  label = 'Loading…',
  variant = 'list',
}: {
  label?: string;
  /** `spinner` for places a list shape would be wrong: a form, a small panel. */
  variant?: 'list' | 'spinner';
}) {
  const theme = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      style={{ flex: 1 }}
    >
      {variant === 'list' ? (
        <SkeletonList rows={4} />
      ) : (
        <View
          style={{ alignItems: 'center', flex: 1, gap: theme.spacing.md, justifyContent: 'center' }}
        >
          <ActivityIndicator color={theme.colors.primary} />
          <AppText tone="muted" size="sm">
            {label}
          </AppText>
        </View>
      )}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  /** The next thing somebody can do about it, when there is one. */
  action?: { label: string; onPress: () => void };
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxl + theme.spacing.lg,
      }}
    >
      <ChamferTile size={48} cutColor={theme.colors.background} style={{ marginBottom: theme.spacing.sm }} />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {description ? (
        <AppText tone="muted" size="sm" align="center">
          {description}
        </AppText>
      ) : null}
      {action ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label={action.label} onPress={action.onPress} size="sm" variant="secondary" />
        </View>
      ) : null}
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
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxl + theme.spacing.lg,
      }}
    >
      <ChamferTile
        size={48}
        label="!"
        background={offline ? theme.colors.warningSoft : theme.colors.dangerSoft}
        color={offline ? theme.colors.warning : theme.colors.danger}
        cutColor={theme.colors.background}
        style={{ marginBottom: theme.spacing.sm }}
      />
      <AppText variant="heading" align="center">
        {offline ? 'You are offline' : 'That did not work'}
      </AppText>
      <AppText tone="muted" size="sm" align="center">
        {message}
      </AppText>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} />
        </View>
      ) : null}
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
        backgroundColor: theme.colors.warningSoft,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <AppText size="sm" tone="warning" weight="medium">
        Offline — showing what was last loaded
      </AppText>
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
  loadingLabel,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  loadingLabel?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return <LoadingState label={loadingLabel} />;
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
  const theme = useTheme();
  return (
    <Screen>
      <View
        accessible
        accessibilityLabel="Restoring your session"
        accessibilityRole="progressbar"
        style={{ alignItems: 'center', flex: 1, gap: theme.spacing.xl, justifyContent: 'center' }}
      >
        <BrandMark size={56} />
        <ActivityIndicator color={theme.colors.textFaint} />
      </View>
    </Screen>
  );
}
