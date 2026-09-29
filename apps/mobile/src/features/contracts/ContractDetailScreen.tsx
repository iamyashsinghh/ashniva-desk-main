import { CONTRACT_STATUS, PERMISSIONS, type ContractDetail } from '@ashniva/types';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import { MetaLine } from '../../shared/components/data-display';
import { Banner } from '../../shared/components/feedback';
import { Grow, Hero, StickyActionBar } from '../../shared/components/layout';
import { AppText, Button, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { PullRefresh } from '../../shared/components/PullRefresh';
import { Sheet } from '../../shared/components/Sheet';
import { TabBar, type TabOption } from '../../shared/components/TabBar';
import { formatDate } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useSession } from '../auth/SessionProvider';
import { CommercialFiles } from './CommercialFiles';
import { ErrorNote, RecordPending, SheetActions } from './commercial-ui';
import {
  CONTRACT_INVALIDATES,
  contractStatusLabel,
  contractStatusTone,
  contractTypeLabel,
} from './contract-display';
import { ContractChangeRequestsTab } from './ContractChangeRequestsTab';
import { ContractHoursTab } from './ContractHoursTab';
import { ContractMilestonesTab } from './ContractMilestonesTab';
import { ContractOverviewTab } from './ContractOverviewTab';
import { ContractPaymentsTab } from './ContractPaymentsTab';

type Tab = 'overview' | 'hours' | 'milestones' | 'payments' | 'documents' | 'changes';

export interface ContractDetailNavigation {
  onEdit: (contractId: string) => void;
  onOpenProject: (projectId: string) => void;
  onOpenMilestone: (milestoneId: string) => void;
  onAddMilestone: (projectId: string, contractId: string) => void;
  onOpenChangeRequest: (changeRequestId: string) => void;
  onOpenTask: (taskId: string) => void;
}

/**
 * One contract, with the web page's sections as tabs.
 *
 * Editing and archiving sit in the bar at the bottom, and only for somebody with
 * `contract:manage` while the contract is not archived — the same rule the web applies, and the
 * API refuses a write to an archived contract regardless.
 */
export function ContractDetailScreen({
  contractId,
  ...navigation
}: { contractId: string } & ContractDetailNavigation) {
  const query = useResource<ContractDetail>(
    ['contracts', 'detail', contractId],
    `/contracts/${contractId}`,
  );
  if (!query.data) {
    return (
      <RecordPending
        error={query.error}
        label="Loading the contract"
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <ContractBody
      contract={query.data}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      {...navigation}
    />
  );
}

function ContractBody({
  contract,
  refreshing,
  onRefresh,
  ...navigation
}: {
  contract: ContractDetail;
  refreshing: boolean;
  onRefresh: () => void;
} & ContractDetailNavigation) {
  const theme = useTheme();
  const { can } = useSession();
  const [tab, setTab] = useState<Tab>('overview');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const readOnly = contract.status === CONTRACT_STATUS.ARCHIVED;
  const canManage = can(PERMISSIONS.CONTRACT_MANAGE) && !readOnly;

  const archive = useApiMutation<void, ContractDetail>({
    path: `/contracts/${contract.id}/archive`,
    invalidate: CONTRACT_INVALIDATES,
    onSuccess: () => setConfirmArchive(false),
  });

  const tabs: TabOption<Tab>[] = [
    { value: 'overview', label: 'Overview' },
    ...(contract.tracksHours ? [{ value: 'hours' as const, label: 'Support hours' }] : []),
    { value: 'milestones', label: 'Milestones', count: contract.milestones.length },
    { value: 'payments', label: 'Payments', count: contract.paymentMilestones.length },
    { value: 'documents', label: 'Documents', count: contract.documents.length },
    { value: 'changes', label: 'Change requests', count: contract.openChangeRequestCount },
  ];

  return (
    <Screen>
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}
        refreshControl={
          <PullRefresh busy={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        <View style={{ padding: theme.spacing.screen, paddingBottom: theme.spacing.md }}>
          <Hero
            overline={`${contract.number} · ${contractTypeLabel(contract.type)}`}
            title={contract.title}
            icon="document-text"
            iconTone={contract.isExpiringSoon ? 'warning' : 'info'}
          >
            <PillRow>
              <Pill
                label={contractStatusLabel(contract.status)}
                tone={contractStatusTone(contract.status)}
              />
              {contract.isExpiringSoon ? <Pill label="Expiring soon" tone="warning" /> : null}
            </PillRow>
            <MetaLine icon="business-outline">{contract.clientOrganization.name}</MetaLine>
            <MetaLine icon="calendar-outline">
              {formatDate(contract.startDate)} → {formatDate(contract.endDate) ?? 'open-ended'}
            </MetaLine>
          </Hero>
        </View>
        <TabBar
          options={tabs}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Contract sections"
        />
        <View style={{ gap: theme.spacing.md, padding: theme.spacing.screen }}>
          {readOnly ? (
            <Banner tone="info">This contract is archived. It can be read but not changed.</Banner>
          ) : null}
          {tab === 'overview' ? (
            <ContractOverviewTab contract={contract} onOpenProject={navigation.onOpenProject} />
          ) : null}
          {tab === 'hours' ? (
            <ContractHoursTab contract={contract} onOpenTask={navigation.onOpenTask} />
          ) : null}
          {tab === 'milestones' ? (
            <ContractMilestonesTab
              contract={contract}
              onOpen={navigation.onOpenMilestone}
              onAdd={navigation.onAddMilestone}
            />
          ) : null}
          {tab === 'payments' ? <ContractPaymentsTab contract={contract} /> : null}
          {tab === 'documents' ? (
            <CommercialFiles
              title="Documents"
              hint="Files marked for the client appear in their portal."
              files={contract.documents}
              parent={{ contractId: contract.id }}
              canUpload={canManage}
              onUploaded={onRefresh}
            />
          ) : null}
          {tab === 'changes' ? (
            <ContractChangeRequestsTab
              contractId={contract.id}
              onOpen={navigation.onOpenChangeRequest}
            />
          ) : null}
        </View>
      </ScrollView>

      {canManage ? (
        <StickyActionBar>
          <Grow>
            <Button
              label="Archive"
              icon="archive-outline"
              variant="secondary"
              onPress={() => setConfirmArchive(true)}
            />
          </Grow>
          <Grow>
            <Button
              label="Edit"
              icon="create-outline"
              onPress={() => navigation.onEdit(contract.id)}
            />
          </Grow>
        </StickyActionBar>
      ) : null}

      <Sheet
        visible={confirmArchive}
        title={`Archive ${contract.number}?`}
        onClose={() => setConfirmArchive(false)}
        footer={
          <SheetActions
            confirmLabel="Archive"
            confirmIcon="archive-outline"
            danger
            busy={archive.busy}
            onCancel={() => setConfirmArchive(false)}
            onConfirm={() => void archive.run()}
          />
        }
      >
        <AppText>
          An archived contract stays readable, with its ledger and documents, but nothing on it can
          be changed any more.
        </AppText>
        <ErrorNote message={archive.error} />
      </Sheet>
    </Screen>
  );
}
