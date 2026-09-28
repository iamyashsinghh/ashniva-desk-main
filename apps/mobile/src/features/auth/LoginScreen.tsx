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
import { BrandMark } from '../../shared/components/brand';
import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Card, Field, Input, Screen } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
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
  const [showPassword, setShowPassword] = useState(false);
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
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            gap: theme.spacing.xl,
            justifyContent: 'center',
            paddingBottom: insets.bottom + theme.spacing.xl,
            paddingHorizontal: theme.spacing.xl,
            paddingTop: insets.top + theme.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: theme.spacing.lg }}>
            <BrandMark size={48} />
            <View style={{ gap: theme.spacing.xs }}>
              <AppText variant="display">Ashniva Desk</AppText>
              <AppText tone="muted">Sign in to see your work.</AppText>
            </View>
          </View>

          <Card style={{ gap: theme.spacing.lg, padding: theme.spacing.xl - 4 }}>
            <Field label="Email">
              <Input
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
              <Input
                ref={passwordRef}
                accessibilityLabel="Password"
                autoCapitalize="none"
                autoComplete="current-password"
                onChangeText={setPassword}
                onSubmitEditing={() => valid && void submit()}
                returnKeyType="go"
                secureTextEntry={!showPassword}
                textContentType="password"
                value={password}
                right={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    hitSlop={8}
                    onPress={() => setShowPassword((value) => !value)}
                    style={{
                      justifyContent: 'center',
                      minHeight: TOUCH_TARGET,
                      paddingHorizontal: theme.spacing.sm,
                    }}
                  >
                    <AppText size="sm" tone="primary" weight="medium">
                      {showPassword ? 'Hide' : 'Show'}
                    </AppText>
                  </Pressable>
                }
              />
            </Field>

            {error ? (
              <Banner tone="danger" role="alert">
                {error}
              </Banner>
            ) : null}

            <Button
              label="Sign in"
              loading={busy}
              disabled={!valid}
              accessibilityHint="Signs you in and opens your work"
              onPress={() => void submit()}
            />
          </Card>

          {mobileEnv.isDevelopment ? (
            <AppText size="xs" tone="faint" align="center">
              Development build — talking to {mobileEnv.apiBaseUrl}
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
