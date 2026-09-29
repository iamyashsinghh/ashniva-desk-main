import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useNetworkStatus } from '../hooks/use-network-status';
import { useTheme } from '../theme/ThemeProvider';
import { BrandMark } from './brand';
import { SkeletonList } from './feedback';
import { Icon, iconToneColors, type IconName, type IconTone } from './Icon';
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
    <View accessible accessibilityLabel={label} accessibilityRole="progressbar" style={{ flex: 1 }}>
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
  icon = 'file-tray-outline',
  iconTone = 'primary',
}: {
  title: string;
  description?: string;
  /** The next thing somebody can do about it, when there is one. */
  action?: { label: string; onPress: () => void };
  icon?: IconName;
  iconTone?: IconTone;
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
      <StateIllustration icon={icon} tone={iconTone} />
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
      <StateIllustration
        icon={offline ? 'cloud-offline-outline' : 'alert-circle-outline'}
        tone={offline ? 'warning' : 'danger'}
      />
      <AppText variant="heading" align="center">
        {offline ? 'You are offline' : 'That did not work'}
      </AppText>
      <AppText tone="muted" size="sm" align="center">
        {message}
      </AppText>
      {onRetry ? (
        <View style={{ marginTop: theme.spacing.md }}>
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            icon="refresh"
            onPress={onRetry}
          />
        </View>
      ) : null}
    </View>
  );
}

/** A large icon inside two soft rings: the picture at the top of an empty or error state. */
function StateIllustration({ icon, tone }: { icon: IconName; tone: IconTone }) {
  const theme = useTheme();
  const { color, background } = iconToneColors(theme, tone);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: 'center',
        backgroundColor: background,
        borderRadius: 48,
        height: 96,
        justifyContent: 'center',
        marginBottom: theme.spacing.md,
        width: 96,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.surface,
          borderRadius: 34,
          height: 68,
          justifyContent: 'center',
          width: 68,
          ...theme.shadow.card,
        }}
      >
        <Icon name={icon} size={32} color={color} />
      </View>
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
        alignItems: 'center',
        backgroundColor: theme.colors.warningSoft,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <Icon name="cloud-offline-outline" size={16} color={theme.colors.warning} />
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
  emptyIcon,
  onRetry,
  loadingLabel,
  children,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: IconName;
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
    return (
      <EmptyState
        title={emptyTitle ?? 'Nothing here'}
        description={emptyDescription}
        {...(emptyIcon ? { icon: emptyIcon } : {})}
      />
    );
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
