import {
  RECORDING_PLAYBACK_SCOPE_LABELS,
  RECORDING_POLICY_LABELS,
  SUPPORT_TIER_LABELS,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { KeyValueRow } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Divider, Pill } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useIvrPolicy, useIvrReadiness } from './api';
import { IvrPolicySheet } from './IvrPolicySheet';

/**
 * Support calls for this product: the policy, and whether calls can actually be placed.
 *
 * Behind `ivr:manage` rather than the product permission, as on the web — who may hear a client's
 * voice is a different decision from who may rename a product. The caller gates the whole section.
 */
export function IvrSection({
  productId,
  onSaved,
}: {
  productId: string;
  onSaved: (message: string) => void;
}) {
  const policy = useIvrPolicy(productId, true);
  const [editing, setEditing] = useState(false);
  const data = policy.data;

  return (
    <Section
      title="Support calls"
      icon="call-outline"
      {...(data
        ? {
            action: (
              <Button
                label="Edit"
                icon="create-outline"
                size="sm"
                variant="ghost"
                accessibilityHint="Edits the call policy"
                onPress={() => setEditing(true)}
              />
            ),
          }
        : {})}
    >
      {policy.isLoading ? (
        <AppText size="sm" tone="muted">
          Loading…
        </AppText>
      ) : null}
      {!policy.isLoading && !data ? (
        <Banner tone="danger" role="alert">
          {policy.error ? errorMessage(policy.error) : 'The call policy could not be loaded.'}
        </Banner>
      ) : null}
      {data ? (
        <>
          <Pill
            label={data.ivrEnabled ? 'Calls offered' : 'Calls off'}
            tone={data.ivrEnabled ? 'success' : 'neutral'}
          />
          <KeyValueRow
            label="Requester may ask"
            value={data.requesterInitiateEnabled ? 'Yes' : 'Staff only'}
          />
          <KeyValueRow
            label="Tiers"
            value={
              data.allowedTiers.length === 0
                ? 'Every tier'
                : data.allowedTiers.map((tier) => SUPPORT_TIER_LABELS[tier]).join(', ')
            }
          />
          <KeyValueRow label="Recording" value={RECORDING_POLICY_LABELS[data.recordingPolicy]} />
          <KeyValueRow
            label="Playback"
            value={RECORDING_PLAYBACK_SCOPE_LABELS[data.recordingPlaybackScope]}
          />
          <KeyValueRow label="Fallback" value={data.fallbackUser?.name ?? 'Nobody'} />
          <KeyValueRow label="Destinations to try" value={String(data.maxAttempts)} />
        </>
      ) : null}
      <Divider />
      <IvrReadiness />
      {editing && data ? (
        <IvrPolicySheet
          productId={productId}
          policy={data}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onSaved('Call policy saved.');
          }}
        />
      ) : null}
    </Section>
  );
}

/**
 * Whether the configured adapter can place a call, and what to ask for when it cannot — the
 * requirements by name, and what happens to a call placed meanwhile, because that is deliberately
 * quiet and reads like a bug.
 */
function IvrReadiness() {
  const theme = useTheme();
  const readiness = useIvrReadiness(true);

  if (readiness.isLoading) {
    return (
      <AppText size="sm" tone="muted">
        Checking whether calls can be placed…
      </AppText>
    );
  }
  if (!readiness.data) {
    return (
      <AppText size="sm" tone="danger">
        {readiness.error ? errorMessage(readiness.error) : 'No answer from the API.'}
      </AppText>
    );
  }
  const { provider, healthy, ready, missing, behaviourWhenUnready } = readiness.data;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Banner tone={healthy ? 'success' : 'warning'}>
        {healthy
          ? `The ${provider} adapter can place calls.`
          : `The ${provider} adapter cannot place calls yet.`}
      </Banner>
      {healthy ? null : (
        <>
          <AppText size="sm" tone="muted">
            {behaviourWhenUnready}
          </AppText>
          <AppText variant="label" tone="muted" uppercase>
            Still needed
          </AppText>
          {missing.map((requirement) => (
            <View key={requirement.key} style={{ gap: 2 }}>
              <AppText size="sm" weight="medium">
                {requirement.what}
              </AppText>
              {requirement.needs.map((need) => (
                <AppText key={need} size="sm" tone="muted">
                  • {need}
                </AppText>
              ))}
            </View>
          ))}
        </>
      )}
      <AppText variant="label" tone="muted" uppercase>
        Already in place
      </AppText>
      {ready.map((item) => (
        <AppText key={item} size="sm" tone="muted">
          • {item}
        </AppText>
      ))}
    </View>
  );
}
