import { CONTRACT_TYPE_LABELS, type PortalContractSummary } from '@ashniva/types';
import {
  Badge,
  Card,
  DescriptionList,
  EmptyState,
  Meter,
  PageHeader,
  Skeleton,
  SkeletonText,
  Toolbar,
  type DescriptionItem,
} from '@ashniva/ui';
import { Link } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ContractStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatMinutes } from '../../../shared/lib/format';
import { usePortalContractsQuery } from '../../contracts/api';

import '../../dashboard/dashboard.css';
import '../portal.css';

/** Client view of their own contracts: terms, dates and remaining hours, never internal costs. */
export function PortalContractsPage() {
  const contracts = usePortalContractsQuery();
  return (
    <div className="dashboard">
      <PageHeader
        title="Your contracts"
        subtitle="Terms, renewal dates and the support hours you have left."
      />
      <QueryState
        isLoading={contracts.isLoading}
        isError={contracts.isError}
        error={contracts.error}
        onRetry={() => void contracts.refetch()}
        loadingFallback={<ContractCardsSkeleton />}
      >
        {contracts.data && contracts.data.length > 0 ? (
          <div className="dashboard__grid dashboard__grid--equal">
            {contracts.data.map((contract) => (
              <PortalContractCard key={contract.id} contract={contract} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No contracts yet"
            description="Your service contracts will appear here once they are active."
          />
        )}
      </QueryState>
    </div>
  );
}

/**
 * Two cards' worth of placeholder, so the grid does not appear from nothing.
 *
 * A labelled group with `aria-busy`, and no heading on the cards: a skeleton is a picture of
 * content that does not exist, and a heading called "Loading contract" would put two entries in
 * the page's outline that vanish a moment later.
 */
function ContractCardsSkeleton() {
  return (
    <div
      className="dashboard__grid dashboard__grid--equal"
      role="group"
      aria-label="Loading contracts"
      aria-busy="true"
    >
      {[0, 1].map((index) => (
        <Card key={index}>
          <Skeleton height="1.25rem" width="70%" />
          <SkeletonText lines={5} />
        </Card>
      ))}
    </div>
  );
}

function PortalContractCard({ contract }: { contract: PortalContractSummary }) {
  return (
    <Card
      title={contract.title}
      headerAddon={
        <Toolbar aria-label={`Status of ${contract.title}`}>
          <ContractStatusPill status={contract.status} />
          {contract.isExpiringSoon ? <Badge tone="warning">Expiring soon</Badge> : null}
        </Toolbar>
      }
    >
      <DescriptionList items={contractItems(contract)} />
    </Card>
  );
}

/**
 * The rows of one contract card.
 *
 * Renewal and support hours are both conditional, which is why the rows are built rather than
 * written out: a conditional `<dt>`/`<dd>` pair inside a `<dl>` is the shape that made these
 * blocks unreadable, and it is the shape `DescriptionList` exists to remove.
 */
function contractItems(contract: PortalContractSummary): DescriptionItem[] {
  const items: DescriptionItem[] = [
    {
      key: 'number',
      term: 'Number',
      description: <Link to={`/portal/contracts/${contract.id}`}>{contract.number}</Link>,
    },
    { key: 'type', term: 'Type', description: CONTRACT_TYPE_LABELS[contract.type] },
    {
      key: 'project',
      term: 'Project',
      description: contract.project ? (
        <Link to={`/portal/projects/${contract.project.id}`}>{contract.project.name}</Link>
      ) : (
        '—'
      ),
    },
    {
      key: 'period',
      term: 'Period',
      description: `${formatDate(contract.startDate)} – ${
        contract.endDate ? formatDate(contract.endDate) : 'open-ended'
      }`,
    },
  ];
  if (contract.renewalDate) {
    items.push({
      key: 'renews',
      term: 'Renews',
      description: formatDate(contract.renewalDate),
    });
  }
  const { hours } = contract;
  if (hours) {
    const total = hours.includedMinutes + hours.purchasedMinutes + hours.carriedForwardMinutes;
    const remaining = Math.max(0, hours.remainingMinutes);
    // The bar and the sentence say the same thing, so the bar is the accessible one and the
    // sentence is the sighted one — rather than the old pairing of an aria-hidden bar with a
    // number nobody could put in context.
    items.push({
      key: 'hours',
      term: 'Support hours left',
      description: (
        <span className="portal-contract__hours">
          <Meter
            label={`Support hours left on ${contract.title}`}
            percent={total > 0 ? (remaining / total) * 100 : 0}
            valueText={`${formatMinutes(remaining)} of ${formatMinutes(total)} left`}
            warn={hours.isLow}
            showValue={false}
            size="sm"
          />
          <span>
            <strong>{formatMinutes(remaining)}</strong>
            <span className="muted"> of {formatMinutes(total)}</span>
          </span>
          {hours.isLow ? <Badge tone="danger">Running low</Badge> : null}
        </span>
      ),
    });
  }
  return items;
}
