import {
  PRIORITY_LABELS,
  SUPPORT_TIER_LABELS,
  type SupportTierPolicySummary,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { Banner } from '../../../shared/components/feedback';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Divider, Pill, PillRow } from '../../../shared/components/primitives';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSupportTiers } from './api';
import { TierSheet } from './TierSheet';

function summary(tier: SupportTierPolicySummary): string {
  const parts = [
    tier.admissionEnabled ? 'Raises tickets' : 'Ingress closed',
    tier.callsEnabled ? 'calls offered' : 'no calls',
  ];
  if (tier.minimumPriority) {
    parts.push(`at least ${PRIORITY_LABELS[tier.minimumPriority]}`);
  }
  if (tier.ackMinutes !== null) {
    parts.push(`ack ${tier.ackMinutes} min`);
  }
  if (tier.escalationMinutes !== null) {
    parts.push(`escalate ${tier.escalationMinutes} min`);
  }
  return parts.join(' · ');
}

/**
 * What each support tier entitles a product to. Organization-wide, because a tier is a commercial
 * arrangement a product merely sits in; editing needs `support-tier:manage`, a separate permission
 * from the one that manages products, as on the web.
 */
export function SupportTiersSection({
  canManage,
  onSaved,
}: {
  canManage: boolean;
  onSaved: (message: string) => void;
}) {
  const theme = useTheme();
  const tiers = useSupportTiers(true);
  const [editing, setEditing] = useState<SupportTierPolicySummary | null>(null);

  return (
    <Section title="Support tiers" icon="layers-outline" collapsible initiallyOpen={false}>
      <AppText size="xs" tone="muted">
        Applies to every product.
      </AppText>
      {tiers.error && !tiers.data ? (
        <Banner tone="danger" role="alert">
          {errorMessage(tiers.error)}
        </Banner>
      ) : null}
      {(tiers.data ?? []).map((tier) => (
        <View key={tier.tier} style={{ gap: theme.spacing.xs }}>
          <Divider />
          <PillRow>
            <AppText weight="medium">{SUPPORT_TIER_LABELS[tier.tier]}</AppText>
            <Pill
              label={tier.configured ? 'Configured' : 'Defaults'}
              tone={tier.configured ? 'info' : 'neutral'}
            />
          </PillRow>
          <AppText size="sm" tone="muted">
            {summary(tier)}
          </AppText>
          <AppText size="xs" tone="faint">
            SLA policy:{' '}
            {tier.slaPolicy?.name ??
              'none selected — tickets fall through to the client’s policy, then the default'}
          </AppText>
          {canManage ? (
            <Button
              label="Edit"
              icon="create-outline"
              size="sm"
              variant="secondary"
              accessibilityHint={`Edits the ${SUPPORT_TIER_LABELS[tier.tier]} tier`}
              onPress={() => setEditing(tier)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </View>
      ))}
      {editing ? (
        <TierSheet
          key={editing.tier}
          tier={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            onSaved(`${SUPPORT_TIER_LABELS[editing.tier]} tier saved.`);
            setEditing(null);
          }}
        />
      ) : null}
    </Section>
  );
}
