import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  type TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mobileEnv } from '../../config/env';
import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import { Icon } from '../../shared/components/Icon';
import { AppText, Button, Card, Field, Input, Screen } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { LoginHeader } from './LoginHeader';
import { PasswordInput } from './PasswordInput';
import { useSession } from './SessionProvider';

/**
 * Signing in.
 *
 * The keyboard covers the lower half of a phone, so the form lifts out of the way rather than
 * leaving the button under it — the single most common way a mobile sign-in screen fails.
 */
export function LoginScreen({ onForgotPassword }: { onForgotPassword?: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

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
        <StatusBar style={theme.isDark ? 'dark' : 'light'} />
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingBottom: insets.bottom + theme.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <LoginHeader />

          <Card
            style={{
              gap: theme.spacing.lg,
              marginHorizontal: theme.spacing.xl - 4,
              marginTop: -56,
              padding: theme.spacing.xl - 4,
              ...theme.shadow.raised,
            }}
          >
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="title">Welcome back</AppText>
              <AppText tone="muted" size="sm">
                Sign in to see your work.
              </AppText>
            </View>
            <Field label="Email">
              <Input
                icon="mail-outline"
                accessibilityLabel="Email address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                onChangeText={setEmail}
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholder="you@company.com"
                returnKeyType="next"
                submitBehavior="submit"
                textContentType="emailAddress"
                value={email}
              />
            </Field>

            <Field
              label="Password"
              hint={
                password.length > 0 && password.length < 8 ? 'At least 8 characters' : undefined
              }
            >
              <PasswordInput
                ref={passwordRef}
                accessibilityLabel="Password"
                autoComplete="current-password"
                onChangeText={setPassword}
                onSubmitEditing={() => valid && void submit()}
                returnKeyType="go"
                textContentType="password"
                value={password}
              />
            </Field>

            {onForgotPassword ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Forgot password?"
                accessibilityHint="Sends a link to reset your password"
                hitSlop={8}
                onPress={onForgotPassword}
                style={({ pressed }) => ({
                  alignSelf: 'flex-end',
                  justifyContent: 'center',
                  marginTop: -theme.spacing.sm,
                  minHeight: TOUCH_TARGET,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <AppText size="sm" tone="primary" weight="medium">
                  Forgot password?
                </AppText>
              </Pressable>
            ) : null}

            {error ? (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            ) : null}

            <Button
              label="Sign in"
              icon="log-in-outline"
              loading={busy}
              disabled={!valid}
              accessibilityHint="Signs you in and opens your work"
              onPress={() => void submit()}
            />
          </Card>

          <View
            style={{
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.xl,
              paddingHorizontal: theme.spacing.xl,
            }}
          >
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
              <Icon name="shield-checkmark-outline" size={14} color={theme.colors.textFaint} />
              <AppText size="xs" tone="faint">
                Your session is stored securely on this device
              </AppText>
            </View>
            {mobileEnv.isDevelopment ? (
              <AppText size="xs" tone="faint" align="center">
                Development build — talking to {mobileEnv.apiBaseUrl}
              </AppText>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
