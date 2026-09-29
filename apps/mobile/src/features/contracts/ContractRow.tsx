import type { ContractSummary } from '@ashniva/types';

import { MetaLine } from '../../shared/components/data-display';
import { PressableCard } from '../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../shared/components/primitives';
import { formatDate } from '../../shared/format/format';
import {
  contractStatusLabel,
  contractStatusTone,
  contractTypeLabel,
  hoursLeftLabel,
  hoursTone,
} from './contract-display';

/**
 * One contract in a list: the columns of the web table, stacked. The two things somebody scans a
 * contract list for — is it about to end, is it running out of hours — are pills, not small print.
 */
export function ContractRow({
  contract,
  onOpen,
}: {
  contract: ContractSummary;
  onOpen: () => void;
}) {
  const ends = formatDate(contract.endDate);
  return (
    <PressableCard
      onPress={onOpen}
      icon="document-text-outline"
      iconTone={contract.isExpiringSoon ? 'warning' : 'info'}
      accessibilityLabel={`${contract.number} ${contract.title}, ${contractStatusLabel(
        contract.status,
      )}, ${contract.clientOrganization.name}`}
    >
      <AppText size="xs" tone="faint" tabular>
        {contract.number} · {contractTypeLabel(contract.type)}
      </AppText>
      <AppText weight="medium" numberOfLines={2}>
        {contract.title}
      </AppText>
      <MetaLine icon="business-outline">
        {contract.clientOrganization.name}
        {contract.project ? ` · ${contract.project.name}` : ''}
      </MetaLine>
      {ends ? <MetaLine icon="calendar-outline">Ends {ends}</MetaLine> : null}
      <PillRow>
        <Pill
          label={contractStatusLabel(contract.status)}
          tone={contractStatusTone(contract.status)}
        />
        {contract.isExpiringSoon ? <Pill label="Expiring soon" tone="warning" /> : null}
        {contract.hours ? (
          <Pill label={hoursLeftLabel(contract.hours)} tone={hoursTone(contract.hours)} />
        ) : null}
        {contract.openChangeRequestCount > 0 ? (
          <Pill
            label={`${contract.openChangeRequestCount} open change${
              contract.openChangeRequestCount === 1 ? '' : 's'
            }`}
            tone="info"
          />
        ) : null}
      </PillRow>
    </PressableCard>
  );
}
