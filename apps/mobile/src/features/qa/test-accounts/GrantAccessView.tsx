import type { CredentialGrantSummary, TestAccountSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../../shared/api/mutations';
import { Banner } from '../../../shared/components/feedback';
import { UserPicker } from '../../../shared/components/pickers';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { formatDateTime } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { CredentialReveal } from '../credentials/CredentialReveal';
import { SheetFooter } from '../qa-controls';

/**
 * Let one person read one test password for a while.
 *
 * A grant to yourself ends in the reveal, because the grant id a reveal runs against is only ever
 * handed back by this request. A grant to anybody else ends at the confirmation: they reveal it
 * from their own phone, and it is never shown on this one.
 */
export function GrantAccessView({
  account,
  onDone,
}: {
  account: TestAccountSummary;
  onDone: () => void;
}) {
  const theme = useTheme();
  const { user } = useSession();
  const [grantedTo, setGrantedTo] = useState<string | null>(user?.id ?? null);
  const [reason, setReason] = useState('');
  const [issued, setIssued] = useState<CredentialGrantSummary | null>(null);
  const grant = useApiMutation<void, CredentialGrantSummary>({
    path: `/test-accounts/${account.id}/grant`,
    body: () => ({
      grantedToUserId: grantedTo,
      reason: reason.trim() || `Testing with ${account.label}`,
    }),
    invalidate: [['qa']],
    onSuccess: setIssued,
  });

  if (issued) {
    return (
      <>
        <AppText>
          {issued.grantedToName} can read this password until {formatDateTime(issued.expiresAt)}.
          Every reveal is written to the access log.
        </AppText>
        {issued.grantedToUserId === user?.id ? (
          <CredentialReveal grantId={issued.id} />
        ) : (
          <AppText size="sm" tone="muted">
            They reveal it from their own screen; it is never shown here.
          </AppText>
        )}
        <Button label="Done" variant="secondary" onPress={onDone} />
      </>
    );
  }

  return (
    <>
      <UserPicker
        label="Who needs it"
        required
        value={grantedTo ? [grantedTo] : []}
        onChange={(ids) => setGrantedTo(ids[0] ?? null)}
        allowClear={false}
        placeholder="Choose a person"
      />
      <Field label="What for" hint="Shown beside every reveal in the access log">
        <Input accessibilityLabel="What for" value={reason} onChangeText={setReason} />
      </Field>
      {account.isActive ? null : (
        <Banner tone="warning">This login has been retired, so it cannot be granted.</Banner>
      )}
      {grant.error ? (
        <Banner tone="danger" role="alert">
          {grant.error}
        </Banner>
      ) : null}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <SheetFooter
          confirmLabel="Grant for 8 hours"
          confirmIcon="key-outline"
          busy={grant.busy}
          disabled={!account.isActive || !grantedTo}
          onCancel={onDone}
          onConfirm={() => void grant.run()}
        />
      </View>
    </>
  );
}
