import {
  ALL_SUPPORT_TIERS,
  MAX_CALL_ATTEMPTS_LIMIT,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_PLAYBACK_SCOPE_LABELS,
  RECORDING_POLICY,
  RECORDING_POLICY_LABELS,
  SUPPORT_TIER_LABELS,
  type IvrPolicySummary,
  type RecordingPlaybackScope,
  type RecordingPolicy,
  type SupportTier,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { Chip } from '../../../shared/components/chips';
import { Banner } from '../../../shared/components/feedback';
import { AppText, Button, Field, Input } from '../../../shared/components/primitives';
import { UserPicker } from '../../../shared/components/pickers';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { SettingSwitch } from '../shared/SettingSwitch';
import { useSaveIvrPolicy } from './api';

const POLICIES = Object.values(RECORDING_POLICY).map((value) => ({
  value,
  label: RECORDING_POLICY_LABELS[value],
}));
const SCOPES = Object.values(RECORDING_PLAYBACK_SCOPE).map((value) => ({
  value,
  label: RECORDING_PLAYBACK_SCOPE_LABELS[value],
}));

/**
 * What this product's support calls may do. Two of these fields decide who can hear a client's
 * voice, so they say what they mean in full. Every one is enforced again by the API.
 */
export function IvrPolicySheet({
  productId,
  policy,
  onClose,
  onSaved,
}: {
  productId: string;
  policy: IvrPolicySummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const theme = useTheme();
  const [ivrEnabled, setIvrEnabled] = useState(policy.ivrEnabled);
  const [requester, setRequester] = useState(policy.requesterInitiateEnabled);
  const [tiers, setTiers] = useState<SupportTier[]>(policy.allowedTiers);
  const [recording, setRecording] = useState<RecordingPolicy>(policy.recordingPolicy);
  const [scope, setScope] = useState<RecordingPlaybackScope>(policy.recordingPlaybackScope);
  const [fallback, setFallback] = useState<string | null>(policy.fallbackUser?.id ?? null);
  const [attempts, setAttempts] = useState(String(policy.maxAttempts));
  const save = useSaveIvrPolicy(productId, onSaved);
  const attemptCount = Number(attempts);
  const attemptsValid =
    Number.isInteger(attemptCount) && attemptCount >= 1 && attemptCount <= MAX_CALL_ATTEMPTS_LIMIT;

  const toggleTier = (tier: SupportTier) =>
    setTiers((current) =>
      current.includes(tier) ? current.filter((item) => item !== tier) : [...current, tier],
    );

  return (
    <Sheet
      visible
      title="Support calls"
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save call policy"
            icon="checkmark"
            loading={save.busy}
            disabled={!attemptsValid}
            onPress={() =>
              void save.run({
                ivrEnabled,
                requesterInitiateEnabled: requester,
                allowedTiers: tiers,
                recordingPolicy: recording,
                recordingPlaybackScope: scope,
                fallbackUserId: fallback,
                maxAttempts: attemptCount,
              })
            }
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <SettingSwitch
        label="Offer support calls"
        description="Off means the Call support action does not appear and the API refuses to place one."
        value={ivrEnabled}
        onChange={setIvrEnabled}
      />
      <SettingSwitch
        label="Let the person who raised the ticket ask for a call"
        description="They never see anybody's number: the IVR bridges both legs of the call."
        value={requester}
        onChange={setRequester}
      />
      <AppText size="sm" weight="medium">
        Support tiers that may call
      </AppText>
      <AppText size="xs" tone="muted">
        None selected means every tier.
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {ALL_SUPPORT_TIERS.map((tier) => (
          <Chip
            key={tier}
            label={SUPPORT_TIER_LABELS[tier]}
            selected={tiers.includes(tier)}
            onPress={() => toggleTier(tier)}
            role="checkbox"
          />
        ))}
      </View>
      <SelectField
        label="Recording"
        hint="With consent means the call is only recorded when the caller was told and agreed."
        options={POLICIES}
        value={[recording]}
        onChange={(ids) => ids[0] && setRecording(ids[0] as RecordingPolicy)}
      />
      <SelectField
        label="Who may play a recording"
        hint="On top of the call:play-recording permission, and never a client. Enforced in the API."
        options={SCOPES}
        value={[scope]}
        onChange={(ids) => ids[0] && setScope(ids[0] as RecordingPlaybackScope)}
      />
      <UserPicker
        label="Fallback destination"
        hint="Where a call goes when the routing chain and escalation both come up empty."
        value={fallback ? [fallback] : []}
        onChange={(ids) => setFallback(ids[0] ?? null)}
        placeholder="Nobody"
      />
      <Field
        label="Destinations to try"
        hint={`At most ${MAX_CALL_ATTEMPTS_LIMIT}. After that the call stops and the support queue is told.`}
        error={attemptsValid ? null : `A whole number from 1 to ${MAX_CALL_ATTEMPTS_LIMIT}.`}
      >
        <Input
          accessibilityLabel="Destinations to try"
          value={attempts}
          onChangeText={setAttempts}
          keyboardType="number-pad"
          invalid={!attemptsValid}
        />
      </Field>
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
