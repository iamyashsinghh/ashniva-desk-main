import {
  MAX_CALL_ATTEMPTS_LIMIT,
  RECORDING_PLAYBACK_SCOPE,
  RECORDING_PLAYBACK_SCOPE_LABELS,
  RECORDING_POLICY,
  RECORDING_POLICY_LABELS,
  SUPPORT_TIER,
  SUPPORT_TIER_LABELS,
  type RecordingPlaybackScope,
  type RecordingPolicy,
  type SupportTier,
} from '@ashniva/types';
import {
  Alert,
  Button,
  Card,
  FormActions,
  FormField,
  FormGrid,
  Input,
  Select,
  Switch,
} from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useDirectoryQuery } from '../../users/api';
import { useIvrPolicyMutation, useIvrPolicyQuery } from '../api';

import '../calls.css';

export interface IvrPolicyCardProps {
  productId: string;
  canManage: boolean;
}

const POLICIES = Object.values(RECORDING_POLICY).map((value) => ({
  value,
  label: RECORDING_POLICY_LABELS[value],
}));
const SCOPES = Object.values(RECORDING_PLAYBACK_SCOPE).map((value) => ({
  value,
  label: RECORDING_PLAYBACK_SCOPE_LABELS[value],
}));
const TIERS = Object.values(SUPPORT_TIER);

/**
 * What this product's support calls may do.
 *
 * Two fields on this form decide who can hear a client's voice, so both say what they mean in
 * full rather than in a label. The scope is narrow by default and widening it is a deliberate
 * act; the recording policy is off by default for the same reason.
 *
 * Nothing here is a security control — every one of these settings is enforced again in the API,
 * on every request, by the same shared decision function. This is where somebody states the
 * policy, not where it is applied.
 */
export function IvrPolicyCard({ productId, canManage }: IvrPolicyCardProps) {
  const policy = useIvrPolicyQuery(productId, canManage);
  const directory = useDirectoryQuery(canManage);
  const save = useIvrPolicyMutation(productId);
  const [form, setForm] = useState<{
    ivrEnabled: boolean;
    recordingPolicy: RecordingPolicy;
    recordingPlaybackScope: RecordingPlaybackScope;
    allowedTiers: SupportTier[];
    requesterInitiateEnabled: boolean;
    fallbackUserId: string;
    maxAttempts: string;
  } | null>(null);
  const [error, setError] = useState<string | undefined>();

  if (!canManage || policy.isLoading || policy.isError || !policy.data) {
    return null;
  }

  const current = form ?? {
    ivrEnabled: policy.data.ivrEnabled,
    recordingPolicy: policy.data.recordingPolicy,
    recordingPlaybackScope: policy.data.recordingPlaybackScope,
    allowedTiers: policy.data.allowedTiers,
    requesterInitiateEnabled: policy.data.requesterInitiateEnabled,
    fallbackUserId: policy.data.fallbackUser?.id ?? '',
    maxAttempts: String(policy.data.maxAttempts),
  };
  const set = <K extends keyof typeof current>(key: K, value: (typeof current)[K]) =>
    setForm({ ...current, [key]: value });

  const people = [
    { value: '', label: 'Nobody' },
    ...(directory.data ?? []).map((person) => ({ value: person.id, label: person.name })),
  ];

  async function submit() {
    setError(undefined);
    try {
      await save.mutateAsync({
        ivrEnabled: current.ivrEnabled,
        recordingPolicy: current.recordingPolicy,
        recordingPlaybackScope: current.recordingPlaybackScope,
        allowedTiers: current.allowedTiers,
        requesterInitiateEnabled: current.requesterInitiateEnabled,
        fallbackUserId: current.fallbackUserId || null,
        maxAttempts: Number(current.maxAttempts) || 1,
      });
      setForm(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Support calls">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Switch
        checked={current.ivrEnabled}
        onChange={(value) => set('ivrEnabled', value)}
        label="Offer support calls"
        description="Off means the Call support action does not appear and the API refuses to place one."
      />
      <Switch
        checked={current.requesterInitiateEnabled}
        onChange={(value) => set('requesterInitiateEnabled', value)}
        label="Let the person who raised the ticket ask for a call"
        description="They never see anybody's number: the IVR bridges both legs of the call."
      />

      <fieldset className="ivr-tiers">
        <legend className="ivr-tiers__legend">
          Support tiers that may call — none selected means every tier
        </legend>
        {TIERS.map((tier) => (
          <label
            key={tier}
            className={`ivr-tiers__tier${current.allowedTiers.includes(tier) ? ' ivr-tiers__tier--on' : ''}`}
          >
            <input
              type="checkbox"
              checked={current.allowedTiers.includes(tier)}
              onChange={(event) =>
                set(
                  'allowedTiers',
                  event.target.checked
                    ? [...current.allowedTiers, tier]
                    : current.allowedTiers.filter((value) => value !== tier),
                )
              }
            />
            {SUPPORT_TIER_LABELS[tier]}
          </label>
        ))}
      </fieldset>

      <FormGrid>
        <FormField
          label="Recording"
          hint="With consent means the call is only recorded when the caller was told and agreed."
        >
          <Select
            options={POLICIES}
            value={current.recordingPolicy}
            onChange={(event) => set('recordingPolicy', event.target.value as RecordingPolicy)}
          />
        </FormField>
        <FormField
          label="Who may play a recording"
          hint="On top of the call:play-recording permission, and never a client. Enforced in the API."
        >
          <Select
            options={SCOPES}
            value={current.recordingPlaybackScope}
            onChange={(event) =>
              set('recordingPlaybackScope', event.target.value as RecordingPlaybackScope)
            }
          />
        </FormField>
        <FormField
          label="Fallback destination"
          hint="Where a call goes when the routing chain and escalation both come up empty."
        >
          <Select
            options={people}
            value={current.fallbackUserId}
            onChange={(event) => set('fallbackUserId', event.target.value)}
          />
        </FormField>
        <FormField
          label="Destinations to try"
          hint={`At most ${MAX_CALL_ATTEMPTS_LIMIT}. After that the call stops and the support queue is told.`}
        >
          <Input
            type="number"
            min={1}
            max={MAX_CALL_ATTEMPTS_LIMIT}
            value={current.maxAttempts}
            onChange={(event) => set('maxAttempts', event.target.value)}
          />
        </FormField>
      </FormGrid>

      <FormActions>
        <Button variant="primary" disabled={save.isPending} onClick={() => void submit()}>
          {save.isPending ? 'Saving…' : 'Save call policy'}
        </Button>
      </FormActions>
    </Card>
  );
}
