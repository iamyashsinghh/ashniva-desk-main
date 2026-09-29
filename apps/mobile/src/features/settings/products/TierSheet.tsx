import {
  PRIORITY,
  PRIORITY_LABELS,
  SUPPORT_AVAILABILITY_WINDOW,
  SUPPORT_AVAILABILITY_WINDOW_LABELS,
  SUPPORT_FALLBACK_STRATEGY,
  SUPPORT_FALLBACK_STRATEGY_LABELS,
  SUPPORT_TIER_LABELS,
  type Priority,
  type SupportAvailabilityWindow,
  type SupportFallbackStrategy,
  type SupportTierPolicySummary,
} from '@ashniva/types';
import { useState } from 'react';

import { Banner } from '../../../shared/components/feedback';
import { Button, Divider, Field, Input } from '../../../shared/components/primitives';
import { SelectField } from '../../../shared/components/SelectField';
import { Sheet } from '../../../shared/components/Sheet';
import { SettingSwitch } from '../shared/SettingSwitch';
import { useSaveTier } from './api';

const PRIORITIES = Object.values(PRIORITY).map((value) => ({
  value,
  label: PRIORITY_LABELS[value],
}));
const STRATEGIES = Object.values(SUPPORT_FALLBACK_STRATEGY).map((value) => ({
  value,
  label: SUPPORT_FALLBACK_STRATEGY_LABELS[value],
}));
const WINDOWS = Object.values(SUPPORT_AVAILABILITY_WINDOW).map((value) => ({
  value,
  label: SUPPORT_AVAILABILITY_WINDOW_LABELS[value],
}));

/** A day, in minutes — the API's ceiling for a tier's timings. */
const MAX_MINUTES = 24 * 60;

/**
 * Said on the three fields nothing reads yet, as on the web: somebody who sets "tell the support
 * executive at once" and is shown no caveat will believe somebody is being told.
 */
const RECORDED_ONLY = 'Recorded for the support agreement; it does not change routing yet.';

function minutes(text: string): number | null | 'invalid' {
  if (text.trim() === '') {
    return null;
  }
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= MAX_MINUTES ? value : 'invalid';
}

/** What one support tier entitles a product to. Organization-wide, not per product. */
export function TierSheet({
  tier,
  onClose,
  onSaved,
}: {
  tier: SupportTierPolicySummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    admissionEnabled: tier.admissionEnabled,
    callsEnabled: tier.callsEnabled,
    requesterInitiatedCalls: tier.requesterInitiatedCalls,
    dedicatedOwnership: tier.dedicatedOwnership,
    minimumPriority: tier.minimumPriority,
    ack: tier.ackMinutes?.toString() ?? '',
    escalation: tier.escalationMinutes?.toString() ?? '',
    fallbackStrategy: tier.fallbackStrategy,
    availabilityWindow: tier.availabilityWindow,
  });
  const save = useSaveTier(tier.tier, onSaved);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const ack = minutes(form.ack);
  const escalation = minutes(form.escalation);
  const minutesError = `Whole minutes from 1 to ${MAX_MINUTES}, or blank to keep the project's own.`;

  const submit = () => {
    if (ack === 'invalid' || escalation === 'invalid') {
      return;
    }
    void save.run({
      admissionEnabled: form.admissionEnabled,
      callsEnabled: form.callsEnabled,
      requesterInitiatedCalls: form.requesterInitiatedCalls,
      dedicatedOwnership: form.dedicatedOwnership,
      minimumPriority: form.minimumPriority,
      ackMinutes: ack,
      escalationMinutes: escalation,
      fallbackStrategy: form.fallbackStrategy,
      availabilityWindow: form.availabilityWindow,
    });
  };

  return (
    <Sheet
      visible
      title={`${SUPPORT_TIER_LABELS[tier.tier]} tier`}
      subtitle="Applies to every product in this tier"
      onClose={onClose}
      maxHeightRatio={0.92}
      footer={
        <>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save tier"
            icon="checkmark"
            loading={save.busy}
            disabled={ack === 'invalid' || escalation === 'invalid'}
            onPress={submit}
            style={{ flex: 1 }}
          />
        </>
      }
    >
      <SettingSwitch
        label="May raise tickets"
        description="Off closes the ingress for this tier entirely."
        value={form.admissionEnabled}
        onChange={(value) => set('admissionEnabled', value)}
      />
      <SettingSwitch
        label="Support calls offered"
        value={form.callsEnabled}
        onChange={(value) => set('callsEnabled', value)}
      />
      <SettingSwitch
        label="Requester may start a call"
        description="Off means only staff may place one."
        value={form.requesterInitiatedCalls}
        onChange={(value) => set('requesterInitiatedCalls', value)}
      />
      <SettingSwitch
        label="Dedicated named owner"
        description={RECORDED_ONLY}
        value={form.dedicatedOwnership}
        onChange={(value) => set('dedicatedOwnership', value)}
      />
      <Divider />
      <SelectField
        label="Lowest priority"
        hint="Raises a request; it never lowers one."
        options={PRIORITIES}
        value={form.minimumPriority ? [form.minimumPriority] : []}
        onChange={(ids) => set('minimumPriority', (ids[0] as Priority | undefined) ?? null)}
        allowClear
        clearLabel="Whatever the product asks for"
        placeholder="Whatever the product asks for"
      />
      <Field
        label="Acknowledge within (min)"
        hint="Blank keeps the project's own."
        error={ack === 'invalid' ? minutesError : null}
      >
        <Input
          accessibilityLabel="Acknowledge within minutes"
          value={form.ack}
          onChangeText={(text) => set('ack', text)}
          keyboardType="number-pad"
          invalid={ack === 'invalid'}
        />
      </Field>
      <Field
        label="Escalate after that (min)"
        hint="Blank keeps the project's own."
        error={escalation === 'invalid' ? minutesError : null}
      >
        <Input
          accessibilityLabel="Escalate after minutes"
          value={form.escalation}
          onChangeText={(text) => set('escalation', text)}
          keyboardType="number-pad"
          invalid={escalation === 'invalid'}
        />
      </Field>
      <SelectField
        label="When nobody is available"
        hint={RECORDED_ONLY}
        options={STRATEGIES}
        value={[form.fallbackStrategy]}
        onChange={(ids) => ids[0] && set('fallbackStrategy', ids[0] as SupportFallbackStrategy)}
      />
      <SelectField
        label="Availability"
        hint={RECORDED_ONLY}
        options={WINDOWS}
        value={[form.availabilityWindow]}
        onChange={(ids) => ids[0] && set('availabilityWindow', ids[0] as SupportAvailabilityWindow)}
      />
      {save.error ? (
        <Banner tone="danger" role="alert">
          {save.error}
        </Banner>
      ) : null}
    </Sheet>
  );
}
