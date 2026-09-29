import {
  CONTRACT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
  type PortalContractDetail,
} from '@ashniva/types';

import { useResource } from '../../../shared/api/queries';
import { KeyValueRow, ListRow, MetaLine } from '../../../shared/components/data-display';
import { Hero, Section } from '../../../shared/components/layout';
import { AppText, Divider, Pill, PillRow } from '../../../shared/components/primitives';
import { formatDate } from '../../../shared/format/format';
import { contractTone, dateRange, ICON_TONES } from '../portal-display';
import { portalKeys } from '../portal-keys';
import { DetailFrame, RecordState } from '../PortalFrame';
import { PortalFileList } from '../PortalFileList';
import { ContractMilestones, HoursSection, LedgerSection } from './contract-sections';

/**
 * One contract as the client sees it: scope, dates, the hour balance and where the hours went,
 * milestones and the documents shared with them.
 *
 * Read-only on both platforms — a client does not change a contract; hours are bought and
 * adjusted by the provider.
 */
export function PortalContractDetailScreen({
  contractId,
  onOpenProject,
}: {
  contractId: string;
  onOpenProject?: (projectId: string) => void;
}) {
  const query = useResource<PortalContractDetail>(
    portalKeys.contract(contractId),
    `/portal/contracts/${contractId}`,
  );
  const contract = query.data;
  if (!contract) {
    return <RecordState query={query} loadingLabel="Loading the contract" />;
  }
  const project = contract.project;

  return (
    <DetailFrame refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <Hero
        overline={`${contract.number} · ${CONTRACT_TYPE_LABELS[contract.type]}`}
        title={contract.title}
        icon="document-text"
        iconTone={ICON_TONES[contractTone(contract.status)]}
      >
        <PillRow>
          <Pill
            label={CONTRACT_STATUS_LABELS[contract.status]}
            tone={contractTone(contract.status)}
          />
          {contract.isExpiringSoon ? <Pill label="Expiring soon" tone="warning" /> : null}
        </PillRow>
        <MetaLine icon="calendar-outline">
          {dateRange(contract.startDate, contract.endDate, 'open-ended')}
        </MetaLine>
      </Hero>

      {contract.hours ? <HoursSection hours={contract.hours} name={contract.title} /> : null}

      <Section title="Scope" icon="document-text-outline">
        <AppText size="sm" tone={contract.scope ? 'default' : 'muted'}>
          {contract.scope ?? 'No scope recorded.'}
        </AppText>
        {contract.clientNotes ? (
          <>
            <Divider />
            <AppText size="sm">{contract.clientNotes}</AppText>
          </>
        ) : null}
      </Section>

      {contract.milestones.length > 0 ? (
        <ContractMilestones milestones={contract.milestones} />
      ) : null}

      {contract.hours ? <LedgerSection entries={contract.recentLedger} /> : null}

      <Section title="Details" icon="list-outline">
        <KeyValueRow label="Number" value={contract.number} />
        <KeyValueRow label="Starts" value={formatDate(contract.startDate) ?? '—'} />
        <KeyValueRow
          label="Ends"
          value={contract.endDate ? (formatDate(contract.endDate) ?? '—') : 'Open-ended'}
        />
        <KeyValueRow label="Renews" value={formatDate(contract.renewalDate) ?? '—'} />
        {project ? (
          <ListRow
            title={project.name}
            subtitle="Project"
            icon="folder-open-outline"
            {...(onOpenProject
              ? {
                  onPress: () => onOpenProject(project.id),
                  accessibilityHint: 'Opens the project',
                }
              : {})}
          />
        ) : null}
      </Section>

      <Section title="Documents" icon="attach-outline" count={contract.documents.length}>
        <PortalFileList files={contract.documents} emptyText="No documents shared yet." />
      </Section>
    </DetailFrame>
  );
}
