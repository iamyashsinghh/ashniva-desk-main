import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import { useStackKeyboardOffset } from '../../shared/components/layout';
import { AppText, Button, Card, Field, Screen } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { changePassword } from '../auth/account-api';
import { NewPasswordFields, PasswordInput } from '../auth/PasswordInput';
import { CHANGED_PASSWORD_MIN, passwordProblem } from '../auth/password-rules';
import { useSession } from '../auth/SessionProvider';

type Outcome = 'stayed-signed-in' | 'signed-out-soon';

/**
 * Changing your own password.
 *
 * The API signs out every session the person has. This device signs itself straight back in with
 * the new password (see `changePassword`), so "other devices have been signed out" is true as
 * written; if that second step fails, the screen says this phone will ask for the password too.
 */
export function ChangePasswordScreen({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const keyboardOffset = useStackKeyboardOffset();
  const { user } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const valid = current.length > 0 && passwordProblem(next, confirm, CHANGED_PASSWORD_MIN) === null;

  const submit = async () => {
    if (!user) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const stayed = await changePassword(current, next, user);
      setOutcome(stayed ? 'stayed-signed-in' : 'signed-out-soon');
      setCurrent('');
      setNext('');
      setConfirm('');
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
        >
          {outcome ? (
            <Card style={{ gap: theme.spacing.lg }}>
              <Banner tone="success" title="Password changed">
                {outcome === 'stayed-signed-in'
                  ? 'Other devices have been signed out. This one stays signed in.'
                  : 'Every device has been signed out. This phone will ask for your new password shortly.'}
              </Banner>
              <Button label="Done" icon="checkmark" onPress={onDone} />
            </Card>
          ) : (
            <Card style={{ gap: theme.spacing.lg }}>
              <AppText size="sm" tone="muted">
                Changing your password signs you out on every other device you use.
              </AppText>
              <Field label="Current password" required>
                <PasswordInput
                  accessibilityLabel="Current password"
                  autoComplete="current-password"
                  textContentType="password"
                  onChangeText={(value) => {
                    setCurrent(value);
                    setError(null);
                  }}
                  value={current}
                />
              </Field>
              <NewPasswordFields
                password={next}
                confirm={confirm}
                onPassword={setNext}
                onConfirm={setConfirm}
                min={CHANGED_PASSWORD_MIN}
              />
              {error ? (
                <Banner tone="danger" role="alert">
                  {error}
                </Banner>
              ) : null}
              <Button
                label="Change password"
                icon="key-outline"
                loading={busy}
                disabled={!valid}
                onPress={() => void submit()}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
