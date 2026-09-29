import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconTile, type IconName } from '../../shared/components/Icon';
import { useStackKeyboardOffset } from '../../shared/components/layout';
import { AppText, Card, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The frame the signed-out screens after sign-in share: a tile saying what the screen is for, a
 * sentence explaining it, and one card holding the form. The stack header above it carries the way
 * back, so the screens themselves only offer the way forward.
 */
export function AuthScaffold({
  icon,
  title,
  description,
  children,
}: {
  icon: IconName;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
            flexGrow: 1,
            gap: theme.spacing.lg,
            padding: theme.spacing.screen,
            paddingBottom: insets.bottom + theme.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <IconTile name={icon} tone="primary" size={56} />
            <AppText variant="title" align="center">
              {title}
            </AppText>
            {description ? (
              <AppText tone="muted" size="sm" align="center">
                {description}
              </AppText>
            ) : null}
          </View>
          <Card style={{ gap: theme.spacing.lg, padding: theme.spacing.xl - 4 }}>{children}</Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
