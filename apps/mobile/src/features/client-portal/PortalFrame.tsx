import type { PermissionKey } from '@ashniva/types';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useStackKeyboardOffset } from '../../shared/components/layout';
import { Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';

/**
 * The frames every portal screen shares: the permission check in front of it, the loading and
 * error states of one record, and the scrolling body with its pinned action bar.
 */

/**
 * A screen the client's role does not hold the permission for.
 *
 * The web guards the same routes with a page that says whose job it is, rather than loading and
 * then showing a 403 on every request — which reads as a broken app. The children are not
 * rendered at all without the permission, so nothing behind the gate is fetched.
 */
export function PermissionGate({
  permission,
  title,
  description,
  children,
}: {
  permission: PermissionKey;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { can } = useSession();
  if (!can(permission)) {
    return (
      <Screen>
        <EmptyState title={title} description={description} icon="lock-closed-outline" />
      </Screen>
    );
  }
  return <>{children}</>;
}

/** The first load or the failure of one record, or null once it is there to draw. */
export function RecordState<T>({
  query,
  loadingLabel,
}: {
  query: UseQueryResult<T>;
  loadingLabel: string;
}) {
  if (!query.data && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <LoadingState label={loadingLabel} />
    </Screen>
  );
}

/** A detail screen's scrolling body: pull to refresh, clear of the keyboard, actions pinned. */
export function DetailFrame({
  refreshing,
  onRefresh,
  actions,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  /** A `StickyActionBar`, drawn under the scroll view so it never scrolls away. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <PullRefresh busy={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
        >
          {children}
        </ScrollView>
        {actions}
      </KeyboardAvoidingView>
    </Screen>
  );
}
