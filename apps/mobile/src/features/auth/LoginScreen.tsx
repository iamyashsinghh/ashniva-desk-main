import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mobileEnv } from '../../config/env';
import { AppText, Button, Field, Input, Screen } from '../../shared/components/primitives';
import { errorMessage } from '../../shared/api/client';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from './SessionProvider';

/**
 * Signing in.
 *
 * The keyboard covers the lower half of a phone, so the form lifts out of the way rather than
 * leaving the button under it — the single most common way a mobile sign-in screen fails.
 */
export function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const valid = email.includes('@') && password.length >= 8;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            gap: theme.spacing.lg,
            justifyContent: 'center',
            paddingBottom: insets.bottom + theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
            paddingTop: insets.top + theme.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: theme.spacing.xs }}>
            <AppText size="xl" weight="bold">
              Ashniva Desk
            </AppText>
            <AppText tone="muted">Sign in to see your work.</AppText>
          </View>

          <Field label="Email">
            <Input
              accessibilityLabel="Email address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              inputMode="email"
              onChangeText={setEmail}
              placeholder="you@company.com"
              returnKeyType="next"
              value={email}
            />
          </Field>

          <Field label="Password">
            <Input
              accessibilityLabel="Password"
              autoCapitalize="none"
              autoComplete="current-password"
              onChangeText={setPassword}
              onSubmitEditing={() => valid && void submit()}
              returnKeyType="go"
              secureTextEntry
              value={password}
            />
          </Field>

          {error ? (
            <AppText tone="danger" size="sm">
              {error}
            </AppText>
          ) : null}

          <Button
            label="Sign in"
            loading={busy}
            disabled={!valid}
            accessibilityHint="Signs you in and opens your work"
            onPress={() => void submit()}
          />

          {mobileEnv.isDevelopment ? (
            <AppText size="xs" tone="faint">
              Development build — talking to {mobileEnv.apiBaseUrl}
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
