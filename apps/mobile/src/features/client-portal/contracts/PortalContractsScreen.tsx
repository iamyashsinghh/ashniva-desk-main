import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  PERMISSIONS,
  type ContractStatus,
  type PortalContractSummary,
} from '@ashniva/types';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { SearchFilterBar } from '../../../shared/components/FilterSheet';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { contractTone, dateRange, ICON_TONES } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { PermissionGate } from '../PortalFrame';
import { PortalList } from '../PortalList';
import { StatusChips } from '../StatusChips';
import { HoursBar } from './HoursBar';

/**
 * A client's contracts: terms, renewal dates and the support hours left — never internal cost or
 * contract value, which the portal DTO does not carry.
 */
export function PortalContractsScreen({ onOpen }: { onOpen: (contractId: string) => void }) {
  return (
    <PermissionGate
      permission={PERMISSIONS.CONTRACT_READ}
      title="Contracts are your administrator’s"
      description="Ask your administrator if you need to see your organization’s contracts."
    >
      <ContractList onOpen={onOpen} />
    </PermissionGate>
  );
}

function ContractList({ onOpen }: { onOpen: (contractId: string) => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContractStatus | null>(null);
  const query = useResource<PortalContractSummary[]>(portalKeys.contracts, '/portal/contracts');
  const contracts = useMemo(() => query.data ?? [], [query.data]);
  const statuses = useMemo(
    () => [...new Set(contracts.map((contract) => contract.status))],
    [contracts],
  );

  const term = search.trim().toLowerCase();
  const visible = contracts.filter(
    (contract) =>
      (!status || contract.status === status) &&
      (!term ||
        [contract.title, contract.number, contract.project?.name ?? ''].some((text) =>
          text.toLowerCase().includes(term),
        )),
  );

  return (
    <PortalList
      items={visible}
      isLoading={query.isLoading}
      error={query.error}
      isRefreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      loadingLabel="Loading your contracts"
      emptyTitle="No contracts yet"
      emptyDescription="Your service contracts will appear here once they are active."
      emptyIcon="document-text-outline"
      filtered={Boolean(term) || status !== null}
      header={
        <View style={{ gap: theme.spacing.sm }}>
          <SearchFilterBar search={search} onSearch={setSearch} placeholder="Search contracts" />
          {statuses.length > 1 ? (
            <StatusChips
              options={statuses}
              value={status}
              onChange={setStatus}
              labelFor={(value) => CONTRACT_STATUS_LABELS[value]}
            />
          ) : null}
        </View>
      }
      renderItem={(contract) => (
        <ContractCard contract={contract} onPress={() => onOpen(contract.id)} />
      )}
    />
  );
}

function ContractCard({
  contract,
  onPress,
}: {
  contract: PortalContractSummary;
  onPress: () => void;
}) {
  const renews = formatDate(contract.renewalDate);
  return (
    <PressableCard
      accessibilityLabel={`${contract.number} ${contract.title}`}
      accessibilityHint="Opens the contract"
      onPress={onPress}
      highlight={contract.isExpiringSoon || Boolean(contract.hours?.isLow)}
      icon="document-text"
      iconTone={ICON_TONES[contractTone(contract.status)]}
    >
      <MetaLine icon="pricetag-outline">
        {contract.number} · {CONTRACT_TYPE_LABELS[contract.type]}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {contract.title}
      </AppText>
      <PillRow>
        <Pill
          label={CONTRACT_STATUS_LABELS[contract.status]}
          tone={contractTone(contract.status)}
        />
        {contract.isExpiringSoon ? <Pill label="Expiring soon" tone="warning" /> : null}
      </PillRow>
      {contract.project ? (
        <MetaLine icon="folder-open-outline">{contract.project.name}</MetaLine>
      ) : null}
      <MetaLine icon="calendar-outline">
        {dateRange(contract.startDate, contract.endDate, 'open-ended')}
        {renews ? ` · renews ${renews}` : ''}
      </MetaLine>
      {contract.hours ? <HoursBar hours={contract.hours} name={contract.title} /> : null}
    </PressableCard>
  );
}
