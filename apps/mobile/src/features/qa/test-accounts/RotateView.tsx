import type { TestAccountSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Field, Input } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { SheetFooter } from '../qa-controls';
import { MIN_SECRET_LENGTH } from './test-account-form';

/**
 * Change a test password.
 *
 * Rotation is not an edit: the API revokes every outstanding grant with it, so anyone mid-test
 * loses access on purpose. The copy says that instead of asking "are you sure".
 */
export function RotateView({
  account,
  onDone,
}: {
  account: TestAccountSummary;
  onDone: () => void;
}) {
  const theme = useTheme();
  // Held only until the request is sent; the view unmounts with it and nothing reads it back.
  const [secret, setSecret] = useState('');
  const tooShort = secret.length > 0 && secret.length < MIN_SECRET_LENGTH;
  // Read from state rather than passed as variables: React Query keeps a mutation's variables in
  // its cache after the request, and a password has no business being there.
  const rotate = useApiMutation<void, TestAccountSummary>({
    path: `/test-accounts/${account.id}/rotate`,
    body: () => (secret ? { secret } : {}),
    invalidate: [['qa']],
    onSuccess: onDone,
  });

  return (
    <>
      <AppText>
        Every grant on this login is revoked as it rotates, so anyone testing with it right now will
        have to ask again.
      </AppText>
      <Field
        label="New password"
        hint="Leave this empty and one is generated. Either way it is encrypted and never shown again here."
        error={tooShort ? `At least ${MIN_SECRET_LENGTH} characters` : null}
      >
        <Input
          accessibilityLabel="New password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="off"
          textContentType="oneTimeCode"
          invalid={tooShort}
          value={secret}
          onChangeText={setSecret}
        />
      </Field>
      {rotate.error ? (
        <Banner tone="danger" role="alert">
          {rotate.error}
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <SheetFooter
          confirmLabel="Rotate and revoke"
          confirmIcon="refresh"
          danger
          busy={rotate.busy}
          disabled={tooShort}
          onCancel={onDone}
          onConfirm={() => void rotate.run()}
        />
      </View>
    </>
  );
}
