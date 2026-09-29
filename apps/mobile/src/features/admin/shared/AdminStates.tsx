import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { Banner } from '../../../shared/components/feedback';
import type { IconName } from '../../../shared/components/Icon';
import { Screen } from '../../../shared/components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * The two whole-screen states every administration screen shares: not yours to open, and not
 * loaded yet. The API refuses these routes on its own; the gate is so a phone never draws a
 * screen of buttons that would each answer 403.
 */

export function NotAllowed({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Screen>
      <View style={{ padding: theme.spacing.screen }}>
        <Banner tone="warning" title="Not available to you">
          {message}
        </Banner>
      </View>
    </Screen>
  );
}

/**
 * What a list shows when it has no rows: still loading, failed, nothing matching the filters, or
 * genuinely empty — four different sentences, because "nothing here" after a failed request is a
 * lie and after a search it is a different truth.
 */
export function ListEmpty({
  loading,
  error,
  onRetry,
  filtered,
  title,
  description,
  icon,
  loadingLabel,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  filtered: boolean;
  title: string;
  description: string;
  icon: IconName;
  loadingLabel: string;
}) {
  if (loading) {
    return <LoadingState label={loadingLabel} />;
  }
  if (error) {
    return (
      <ErrorState
        message={errorMessage(error)}
        offline={error instanceof Error && error.name === 'NetworkError'}
        onRetry={onRetry}
      />
    );
  }
  if (filtered) {
    return (
      <EmptyState
        title="Nothing matches"
        description="Try a different search or clear the filters."
        icon="search"
      />
    );
  }
  return <EmptyState title={title} description={description} icon={icon} />;
}

/** A detail screen before its record arrives: a spinner, or the failure with a retry. */
export function DetailPending({
  error,
  onRetry,
  label,
}: {
  error: unknown;
  onRetry: () => void;
  label: string;
}) {
  return (
    <Screen>
      {error ? (
        <ErrorState
          message={errorMessage(error)}
          offline={error instanceof Error && error.name === 'NetworkError'}
          onRetry={onRetry}
        />
      ) : (
        <LoadingState label={label} variant="spinner" />
      )}
    </Screen>
  );
}
