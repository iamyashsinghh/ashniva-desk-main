import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { useStackKeyboardOffset } from '../../../shared/components/layout';
import { Screen } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { PullRefresh } from '../../../shared/components/PullRefresh';

/** The scrolling frame of a ticket screen: pull to refresh, and lifted clear of the keyboard. */
export function DetailScroll({
  refreshing,
  onRefresh,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
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
      </KeyboardAvoidingView>
    </Screen>
  );
}
