import {
  PRIORITY,
  PRIORITY_LABELS,
  SUPPORT_AVAILABILITY_WINDOW,
  SUPPORT_AVAILABILITY_WINDOW_LABELS,
  SUPPORT_FALLBACK_STRATEGY,
  SUPPORT_FALLBACK_STRATEGY_LABELS,
  SUPPORT_TIER_LABELS,
  type SupportTierPolicySummary,
} from '@ashniva/types';
import { Alert, Badge, Card, FormField, FormGrid, Input, Select, Switch } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useSupportTierMutation, useSupportTiersQuery } from '../callbacks-api';

export interface SupportTiersCardProps {
  canManage: boolean;
}

const PRIORITIES = [
  { value: '', label: 'Whatever the product asks for' },
  ...Object.values(PRIORITY).map((value) => ({ value, label: PRIORITY_LABELS[value] })),
];
const STRATEGIES = Object.values(SUPPORT_FALLBACK_STRATEGY).map((value) => ({
  value,
  label: SUPPORT_FALLBACK_STRATEGY_LABELS[value],
}));
const WINDOWS = Object.values(SUPPORT_AVAILABILITY_WINDOW).map((value) => ({
  value,
  label: SUPPORT_AVAILABILITY_WINDOW_LABELS[value],
}));

/**
 * Said on the three fields nothing reads yet.
 *
 * An administrator who sets "tell the support executive at once" and is shown no caveat will
 * believe somebody is being told. Saying it plainly is cheaper than the support call that follows,
 * and honest until the routing policy is versioned to act on these.
 */
const RECORDED_ONLY = 'Recorded for the support agreement; it does not change routing yet';

/**
 * What each support tier entitles a product to.
 *
 * Organization-wide rather than per product, because a tier is a commercial arrangement and a
 * product merely sits in one. Nothing on this screen is priced: what a tier costs is recorded
 * wherever contracts are, and putting an amount here would make Ashniva's price list part of the
 * schema.
 *
 * A tier nobody has configured is shown as such and running on the neutral defaults — every
 * behaviour open, every timing inherited — because "unset" and "set to the same values" are
 * different statements to somebody deciding what to change.
 */
export function SupportTiersCard({ canManage }: SupportTiersCardProps) {
  const tiers = useSupportTiersQuery();
  const save = useSupportTierMutation();
  const [error, setError] = useState<string | undefined>();

  async function update(tier: string, input: Record<string, unknown>): Promise<void> {
    setError(undefined);
    try {
      await save.mutateAsync({ tier, input });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card
      title="Support tiers"
      headerAddon={<span className="muted">Applies to every product</span>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {(tiers.data ?? []).map((tier) => (
        <TierRow
          key={tier.tier}
          tier={tier}
          canManage={canManage}
          busy={save.isPending}
          onSave={(input) => update(tier.tier, input)}
        />
      ))}
    </Card>
  );
}

function TierRow({
  tier,
  canManage,
  busy,
  onSave,
}: {
  tier: SupportTierPolicySummary;
  canManage: boolean;
  busy: boolean;
  onSave: (input: Record<string, unknown>) => Promise<void>;
}) {
  const [ack, setAck] = useState(tier.ackMinutes?.toString() ?? '');
  const [escalation, setEscalation] = useState(tier.escalationMinutes?.toString() ?? '');

  return (
    <section className="tier-row">
      <h3>
        {SUPPORT_TIER_LABELS[tier.tier]}{' '}
        <Badge tone={tier.configured ? 'info' : 'neutral'}>
          {tier.configured ? 'Configured' : 'Defaults'}
        </Badge>
      </h3>
      <FormGrid>
        <FormField label="May raise tickets" hint="Off closes the ingress for this tier entirely">
          <Switch
            checked={tier.admissionEnabled}
            disabled={!canManage || busy}
            onChange={(value) => void onSave({ admissionEnabled: value })}
            label={tier.admissionEnabled ? 'Open' : 'Closed'}
          />
        </FormField>
        <FormField label="Support calls">
          <Switch
            checked={tier.callsEnabled}
            disabled={!canManage || busy}
            onChange={(value) => void onSave({ callsEnabled: value })}
            label={tier.callsEnabled ? 'Offered' : 'Not offered'}
          />
        </FormField>
        <FormField label="Requester may start a call">
          <Switch
            checked={tier.requesterInitiatedCalls}
            disabled={!canManage || busy}
            onChange={(value) => void onSave({ requesterInitiatedCalls: value })}
            label={tier.requesterInitiatedCalls ? 'Yes' : 'Staff only'}
          />
        </FormField>
        <FormField label="Named owner" hint={RECORDED_ONLY}>
          <Switch
            checked={tier.dedicatedOwnership}
            disabled={!canManage || busy}
            onChange={(value) => void onSave({ dedicatedOwnership: value })}
            label={tier.dedicatedOwnership ? 'Dedicated' : 'Routed'}
          />
        </FormField>
        <FormField label="Lowest priority" hint="Raises a request; it never lowers one">
          <Select
            value={tier.minimumPriority ?? ''}
            disabled={!canManage || busy}
            options={PRIORITIES}
            onChange={(event) =>
              void onSave({
                minimumPriority: event.target.value === '' ? null : event.target.value,
              })
            }
          />
        </FormField>
        <FormField label="Acknowledge within" hint="Minutes. Blank keeps the project's own.">
          <Input
            value={ack}
            inputMode="numeric"
            disabled={!canManage || busy}
            onChange={(event) => setAck(event.target.value)}
            onBlur={() => void onSave({ ackMinutes: ack === '' ? null : Number(ack) })}
          />
        </FormField>
        <FormField label="Escalate after that" hint="Minutes. Blank keeps the project's own.">
          <Input
            value={escalation}
            inputMode="numeric"
            disabled={!canManage || busy}
            onChange={(event) => setEscalation(event.target.value)}
            onBlur={() =>
              void onSave({ escalationMinutes: escalation === '' ? null : Number(escalation) })
            }
          />
        </FormField>
        <FormField label="When nobody is available" hint={RECORDED_ONLY}>
          <Select
            value={tier.fallbackStrategy}
            disabled={!canManage || busy}
            options={STRATEGIES}
            onChange={(event) => void onSave({ fallbackStrategy: event.target.value })}
          />
        </FormField>
        <FormField label="Availability" hint={RECORDED_ONLY}>
          <Select
            value={tier.availabilityWindow}
            disabled={!canManage || busy}
            options={WINDOWS}
            onChange={(event) => void onSave({ availabilityWindow: event.target.value })}
          />
        </FormField>
      </FormGrid>
      <p className="muted">
        SLA policy:{' '}
        {tier.slaPolicy?.name ??
          'none selected — tickets fall through to the client’s policy, then the default'}
      </p>
    </section>
  );
}
