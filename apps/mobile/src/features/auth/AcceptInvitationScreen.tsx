import type { InvitationPreview } from '@ashniva/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { shouldRetry } from '../../shared/api/queries';
import { KeyValueRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { LoadingState } from '../../shared/components/states';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { previewInvitation } from './account-api';
import { AuthScaffold } from './AuthScaffold';
import { NewPasswordFields } from './PasswordInput';
import { NEW_ACCOUNT_PASSWORD_MIN, passwordProblem } from './password-rules';
import { useSession } from './SessionProvider';

/**
 * Accepting an invitation: who it is for, then a name and a first password.
 *
 * The preview is shown before anything is asked, so somebody who opened a colleague's forwarded
 * link sees whose account it is before creating it. Accepting answers with a session, and the
 * navigator swaps to the signed-in app on its own — there is no "now sign in" step.
 */
export function AcceptInvitationScreen({ token, onDone }: { token: string; onDone: () => void }) {
  const preview = useQuery<InvitationPreview>({
    queryKey: ['auth', 'invitation', token],
    // `skipAuth` inside: this runs signed out, and a 401-triggered refresh would have no token.
    queryFn: () => previewInvitation(token),
    retry: shouldRetry,
  });

  if (preview.error) {
    return (
      <AuthScaffold icon="mail-unread-outline" title="This invitation cannot be used">
        <Banner tone="danger" role="alert" title={errorMessage(preview.error)}>
          Ask the person who invited you to send a new invitation.
        </Banner>
        <Button label="Back to sign in" icon="log-in-outline" onPress={onDone} />
      </AuthScaffold>
    );
  }
  if (!preview.data) {
    return <LoadingState label="Checking your invitation" variant="spinner" />;
  }
  return <AcceptForm token={token} invitation={preview.data} />;
}

function AcceptForm({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const theme = useTheme();
  const { acceptInvitation } = useSession();
  const [name, setName] = useState(invitation.name);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid =
    name.trim().length >= 2 &&
    passwordProblem(password, confirm, NEW_ACCOUNT_PASSWORD_MIN) === null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await acceptInvitation({ token, name: name.trim(), password });
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <AuthScaffold
      icon="people-outline"
      title="Welcome to the team"
      description={`${invitation.organizationName} invited you to Ashniva Desk.`}
    >
      <View style={{ gap: theme.spacing.xs }}>
        <KeyValueRow label="Email" value={invitation.email} />
        <KeyValueRow label="Organization" value={invitation.organizationName} />
        <KeyValueRow label="Role" value={invitation.roleName} />
        <AppText size="xs" tone="faint">
          {`The invitation expires ${formatDateTime(invitation.expiresAt) ?? 'soon'}.`}
        </AppText>
      </View>
      <Field label="Your name" required>
        <Input
          icon="person-outline"
          accessibilityLabel="Your name"
          autoComplete="name"
          textContentType="name"
          onChangeText={setName}
          value={name}
        />
      </Field>
      <NewPasswordFields
        password={password}
        confirm={confirm}
        onPassword={(value) => {
          setPassword(value);
          setError(null);
        }}
        onConfirm={setConfirm}
        min={NEW_ACCOUNT_PASSWORD_MIN}
        label="Choose a password"
      />
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <Button
        label="Create my account"
        icon="checkmark"
        loading={busy}
        disabled={!valid}
        onPress={() => void submit()}
      />
    </AuthScaffold>
  );
}
