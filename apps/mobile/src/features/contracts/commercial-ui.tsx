import type { ReactNode } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import type { IconName } from '../../shared/components/Icon';
import { Button, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * Small pieces the contract, change-request and milestone screens all use: the footer of a sheet,
 * the screen shown while a record loads or fails, and the one shown to somebody without access.
 */

/** A sheet's pinned footer: back out, or do it. */
export function SheetActions({
  confirmLabel,
  confirmIcon,
  onConfirm,
  onCancel,
  busy,
  disabled = false,
  danger = false,
}: {
  confirmLabel: string;
  confirmIcon: IconName;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <Button label="Back" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      <Button
        label={confirmLabel}
        icon={confirmIcon}
        variant={danger ? 'danger' : 'primary'}
        loading={busy}
        disabled={disabled}
        onPress={onConfirm}
        style={{ flex: 1 }}
      />
    </>
  );
}

/** The whole screen while a record is on its way, or when it could not be read. */
export function RecordPending({
  error,
  label,
  onRetry,
}: {
  error: unknown;
  label: string;
  onRetry: () => void;
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

/** A form opened by somebody the API would refuse: say so rather than draw fields that 403. */
export function NotAvailable({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Screen>
      <View style={{ padding: theme.spacing.screen }}>
        <Banner tone="warning" title="Not available to you">
          {children}
        </Banner>
      </View>
    </Screen>
  );
}

/** A mutation's failure, under the thing that failed. */
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <Banner tone="danger" role="alert">
      {message}
    </Banner>
  );
}
