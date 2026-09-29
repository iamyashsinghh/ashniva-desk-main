import { useState } from 'react';

import { errorMessage } from '../../shared/api/client';
import { Banner } from '../../shared/components/feedback';
import { Button, Field, Input } from '../../shared/components/primitives';
import { requestPasswordReset } from './account-api';
import { AuthScaffold } from './AuthScaffold';

/**
 * Asking for a reset link.
 *
 * The answer is the same whether or not the address has an account, because the API's is: saying
 * "no such account" here would turn the screen into a way of finding out who works where.
 */
export function ForgotPasswordScreen({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = email.trim();

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(trimmed);
      setSent(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <AuthScaffold icon="mail-open-outline" title="Check your email">
        <Banner tone="success" title="Reset link requested">
          {`If an account exists for ${trimmed}, a reset link is on its way. It expires soon and works once.`}
        </Banner>
        <Button label="Back to sign in" icon="log-in-outline" onPress={onDone} />
      </AuthScaffold>
    );
  }

  return (
    <AuthScaffold
      icon="key-outline"
      title="Reset your password"
      description="Enter the email you sign in with and we will send you a link to choose a new password."
    >
      <Field label="Email" required>
        <Input
          icon="mail-outline"
          accessibilityLabel="Email address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          autoFocus
          inputMode="email"
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
          }}
          onSubmitEditing={() => trimmed.includes('@') && void submit()}
          placeholder="you@company.com"
          returnKeyType="send"
          textContentType="emailAddress"
          value={email}
        />
      </Field>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <Button
        label="Send reset link"
        icon="paper-plane-outline"
        loading={busy}
        disabled={!trimmed.includes('@')}
        onPress={() => void submit()}
      />
      <Button label="Back to sign in" variant="ghost" onPress={onDone} />
    </AuthScaffold>
  );
}
