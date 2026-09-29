import { useState } from 'react';

import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import { Button } from '../../shared/components/primitives';
import { resetPassword } from './account-api';
import { AuthScaffold } from './AuthScaffold';
import { NewPasswordFields } from './PasswordInput';
import { NEW_ACCOUNT_PASSWORD_MIN, passwordProblem } from './password-rules';

/**
 * Choosing a new password from a reset link.
 *
 * Opened from the link in the e-mail (`reset-password/:token`). The token is single-use, and using
 * it signs out every device, which the success message says so a phone that later asks for the
 * password again is not a surprise.
 */
export function ResetPasswordScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = passwordProblem(password, confirm, NEW_ACCOUNT_PASSWORD_MIN);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthScaffold icon="checkmark-done-outline" title="Password changed">
        <Banner tone="success">
          Your new password is set. Every device you were signed in on has been signed out — sign in
          again with the new password.
        </Banner>
        <Button label="Sign in" icon="log-in-outline" onPress={onDone} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      icon="lock-open-outline"
      title="Choose a new password"
      description="The link works once. Setting a password here signs you out everywhere else."
    >
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPassword={(value) => {
          setPassword(value);
          setError(null);
        }}
        onConfirm={setConfirm}
        min={NEW_ACCOUNT_PASSWORD_MIN}
      />
      {error ? (
        <Banner tone="danger" role="alert" title={error}>
          If the link has expired or was already used, ask for a new one from the sign-in screen.
        </Banner>
      ) : null}
      <Button
        label="Set password"
        icon="checkmark"
        loading={busy}
        disabled={problem !== null}
        onPress={() => void submit()}
      />
      <Button label="Back to sign in" variant="ghost" onPress={onDone} />
    </AuthScaffold>
  );
}
