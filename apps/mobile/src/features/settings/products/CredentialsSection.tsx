import type { CreatedProductCredential, ProductCredentialSummary } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import {
  AppText,
  Button,
  Divider,
  Field,
  Input,
  Pill,
  PillRow,
} from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { OneTimeSecretSheet } from '../shared/OneTimeSecretSheet';
import { useIssueCredential, useRevokeCredential, useRotateCredential } from './api';
import { when } from './product-display';

/**
 * The machine credentials a product authenticates with.
 *
 * A revoked credential stays on the list, as on the web: "which key was this, and when did we stop
 * trusting it" is a question asked during an incident. Rotating and revoking both break whatever is
 * configured with the old secret, so each asks first.
 */
export function CredentialsSection({
  productId,
  credentials,
  canManage,
}: {
  productId: string;
  credentials: readonly ProductCredentialSummary[];
  canManage: boolean;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState('');
  const [issued, setIssued] = useState<CreatedProductCredential | null>(null);
  const [confirming, setConfirming] = useState<{
    action: 'rotate' | 'revoke';
    credential: ProductCredentialSummary;
  } | null>(null);
  const issue = useIssueCredential(productId);
  const rotate = useRotateCredential(productId);
  const revoke = useRevokeCredential(productId);

  const issueNow = async () => {
    const result = await issue.run(label.trim());
    if (result) {
      setLabel('');
      setIssued(result);
    }
  };

  const confirm = async () => {
    if (!confirming) {
      return;
    }
    const { action, credential } = confirming;
    if (action === 'rotate') {
      const result = await rotate.run(credential.id);
      if (result) {
        setConfirming(null);
        setIssued(result);
      }
    } else if (await revoke.run(credential.id)) {
      setConfirming(null);
    }
  };

  return (
    <Section title="Machine credentials" icon="key-outline" count={credentials.length}>
      <AppText size="xs" tone="muted">
        Shown once. Rotate to replace, revoke to stop.
      </AppText>
      {canManage ? (
        <>
          <Field label="What is this credential for?" hint="“Carelix production”, “Irista staging”">
            <Input
              accessibilityLabel="What is this credential for?"
              value={label}
              onChangeText={setLabel}
              placeholder="Carelix production"
            />
          </Field>
          <Button
            label="Issue credential"
            icon="add"
            size="sm"
            loading={issue.busy}
            disabled={label.trim().length < 2}
            onPress={() => void issueNow()}
            style={{ alignSelf: 'flex-start' }}
          />
          {issue.error ? (
            <Banner tone="danger" role="alert">
              {issue.error}
            </Banner>
          ) : null}
        </>
      ) : null}
      {credentials.length === 0 ? (
        <AppText size="sm" tone="muted">
          No credentials yet. This product cannot raise tickets.
        </AppText>
      ) : null}
      {credentials.map((credential) => (
        <View key={credential.id} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <AppText weight="medium">{credential.label}</AppText>
          <AppText size="xs" tone="muted" tabular>
            {credential.keyId.slice(0, 12)}…
          </AppText>
          <PillRow>
            {credential.isActive ? (
              <Pill label="Active" tone="success" />
            ) : (
              <Pill label={`Revoked ${when(credential.revokedAt)}`} />
            )}
          </PillRow>
          <AppText size="xs" tone="faint">
            Last used {credential.lastUsedAt ? when(credential.lastUsedAt) : 'never'}
          </AppText>
          {canManage && credential.isActive ? (
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button
                label="Rotate"
                icon="refresh"
                size="sm"
                variant="secondary"
                accessibilityHint={`Replaces the secret for ${credential.label}`}
                onPress={() => setConfirming({ action: 'rotate', credential })}
              />
              <Button
                label="Revoke"
                icon="close-circle-outline"
                size="sm"
                variant="dangerGhost"
                accessibilityHint={`Stops ${credential.label} working`}
                onPress={() => setConfirming({ action: 'revoke', credential })}
              />
            </View>
          ) : null}
        </View>
      ))}

      {confirming ? (
        <ConfirmSheet
          title={
            confirming.action === 'rotate' ? 'Rotate this credential?' : 'Revoke this credential?'
          }
          message={
            confirming.action === 'rotate'
              ? `“${confirming.credential.label}” gets a new secret and the old one stops working at once. Update the calling system straight away.`
              : `“${confirming.credential.label}” stops working at once. Anything still configured with it will be refused.`
          }
          confirmLabel={confirming.action === 'rotate' ? 'Rotate' : 'Revoke'}
          busy={rotate.busy || revoke.busy}
          error={rotate.error ?? revoke.error}
          onConfirm={() => void confirm()}
          onClose={() => {
            rotate.reset();
            revoke.reset();
            setConfirming(null);
          }}
        />
      ) : null}
      {issued ? (
        <OneTimeSecretSheet
          title={`Credential for ${issued.credential.label}`}
          secret={issued.secret}
          warning="This is the only time this secret is shown. Nothing can display it again — if it is lost, rotate the credential to get a new one."
          onClose={() => setIssued(null)}
        >
          <AppText size="sm" tone="muted">
            Configure it in {issued.credential.label} as the bearer token for POST
            /api/v1/support/tickets.
          </AppText>
        </OneTimeSecretSheet>
      ) : null}
    </Section>
  );
}
