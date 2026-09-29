import {
  BILLING_PERIOD_LABELS,
  CARRY_FORWARD_RULE_LABELS,
  PERMISSIONS,
  type ContractDetail,
} from '@ashniva/types';
import { View } from 'react-native';

import { KeyValueRow, ListRow } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Pill } from '../../shared/components/primitives';
import { formatDate, formatMinutes } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { formatMoney } from './contract-display';
import { HoursSummary } from './HoursSummary';

/**
 * The overview: the balance, what the client has agreed to, the terms, and the notes the client
 * never sees. Internal cost is drawn only for `cost:read`; the API already leaves it out for anyone
 * else, and the value is null for somebody who may not see money at all.
 */
export function ContractOverviewTab({
  contract,
  onOpenProject,
}: {
  contract: ContractDetail;
  onOpenProject: (projectId: string) => void;
}) {
  const theme = useTheme();
  const { can } = useSession();
  const canSeeCost = can(PERMISSIONS.COST_READ);

  return (
    <View style={{ gap: theme.spacing.md }}>
      {contract.hours ? <HoursSummary hours={contract.hours} /> : null}

      <Section title="Scope" icon="reader-outline">
        <Pill label="The client sees this" tone="success" />
        <AppText>{contract.scope?.trim() || 'No scope written yet.'}</AppText>
        {contract.clientNotes ? (
          <AppText size="sm" tone="muted">
            Notes for the client: {contract.clientNotes}
          </AppText>
        ) : null}
      </Section>

      <Section title="Terms" icon="list-outline">
        {contract.project ? (
          <ListRow
            title={contract.project.name}
            subtitle="Project"
            icon="folder-open-outline"
            iconTone="teal"
            onPress={() => onOpenProject(contract.project?.id ?? '')}
            accessibilityLabel={`Open project ${contract.project.name}`}
          />
        ) : (
          <KeyValueRow label="Project" value="Whole client" />
        )}
        <KeyValueRow
          label="Period"
          value={`${formatDate(contract.startDate)} → ${formatDate(contract.endDate) ?? '—'}`}
        />
        <KeyValueRow
          label="Renewal"
          value={`${formatDate(contract.renewalDate) ?? '—'}${
            contract.autoRenew ? ' · auto-renews' : ''
          } · notice ${contract.renewalNoticeDays} days`}
        />
        {contract.contractValue !== null ? (
          <KeyValueRow
            label="Value"
            value={formatMoney(contract.contractValue, contract.currency)}
          />
        ) : null}
        {canSeeCost && contract.internalCost !== null ? (
          <KeyValueRow
            label="Internal cost (team only)"
            value={formatMoney(contract.internalCost, contract.currency)}
          />
        ) : null}
        {contract.tracksHours ? (
          <>
            <KeyValueRow
              label="Included hours"
              value={`${formatMinutes(contract.includedMinutesPerPeriod)} per ${BILLING_PERIOD_LABELS[
                contract.billingPeriod
              ].toLowerCase()}`}
            />
            <KeyValueRow
              label="Carry forward"
              value={`${CARRY_FORWARD_RULE_LABELS[contract.carryForwardRule]}${
                contract.carryForwardCapMinutes
                  ? ` (cap ${formatMinutes(contract.carryForwardCapMinutes)})`
                  : ''
              }`}
            />
            <KeyValueRow
              label="Low-hours warning"
              value={`at ${formatMinutes(contract.lowHoursThresholdMinutes)}`}
            />
          </>
        ) : null}
        <KeyValueRow label="Created by" value={contract.createdBy.name} />
      </Section>

      {contract.internalNotes ? (
        <Banner tone="warning" title="Internal notes — the client never sees these">
          <AppText size="sm">{contract.internalNotes}</AppText>
        </Banner>
      ) : null}
    </View>
  );
}
