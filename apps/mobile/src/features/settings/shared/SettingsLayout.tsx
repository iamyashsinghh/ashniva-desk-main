import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage, isOffline } from '../../../shared/api/client';
import { Banner } from '../../../shared/components/feedback';
import { StickyActionBar, useStackKeyboardOffset } from '../../../shared/components/layout';
import { Screen } from '../../../shared/components/primitives';
import { PullRefresh } from '../../../shared/components/PullRefresh';
import { EmptyState, ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';

/**
 * The frame every settings screen shares: a scrolling form that lifts above the keyboard, pulls to
 * refresh, and keeps its Save within thumb's reach in a sticky bar.
 */
export function SettingsScroll({
  children,
  footer,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  /** The screen's actions, pinned to the bottom. Left out for somebody who may only read. */
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => unknown;
}) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={keyboardOffset}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          refreshControl={
            onRefresh ? <PullRefresh busy={refreshing ?? false} onRefresh={onRefresh} /> : undefined
          }
        >
          {children}
        </ScrollView>
        {footer ? <StickyActionBar>{footer}</StickyActionBar> : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** A settings screen somebody reached without the permission it needs. */
export function NoAccess({ description }: { description: string }) {
  return (
    <Screen>
      <EmptyState icon="lock-closed-outline" title="Not available" description={description} />
    </Screen>
  );
}

/**
 * The first load and a failed one, for a screen built around one record.
 *
 * Returns null once the record is there, so a screen reads `gate ?? <the form>`. A failed refetch
 * with data already on screen is not a reason to take the form away; the caller shows a banner.
 */
export function resourceGate(query: UseQueryResult<unknown>, loadingLabel: string): ReactNode {
  if (query.data !== undefined) {
    return null;
  }
  if (query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={isOffline(query.error)}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }
  return (
    <Screen>
      <LoadingState label={loadingLabel} variant="spinner" />
    </Screen>
  );
}

export interface Feedback {
  tone: 'success' | 'danger';
  message: string;
}

/** What the last action came to — "Settings saved", or the API's reason it was not. */
export function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }
  return (
    <Banner tone={feedback.tone} {...(feedback.tone === 'danger' ? { role: 'alert' } : {})}>
      {feedback.message}
    </Banner>
  );
}
