import {
  BILLING_PERIOD_LABELS,
  CARRY_FORWARD_RULE_LABELS,
  type ContractDetail,
} from '@ashniva/types';
import { Badge, Card, DescriptionList, type DescriptionItem } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatDate, formatMinutes } from '../../../shared/lib/format';
import { HoursSummary } from './HoursPanel';

interface ContractOverviewProps {
  contract: ContractDetail;
  /** Internal cost is only rendered for people with cost:read. */
  canSeeCost: boolean;
}

/** Overview tab: scope and notes for the client, terms, and internal-only figures. */
export function ContractOverview({ contract, canSeeCost }: ContractOverviewProps) {
  return (
    <>
      {contract.hours ? <HoursSummary hours={contract.hours} /> : null}
      <div className="dashboard__grid dashboard__grid--equal">
        <Card title="Scope" headerAddon={<Badge tone="success">Client-visible</Badge>}>
          <p className="prose">{contract.scope?.trim() || 'No scope written yet.'}</p>
          {contract.clientNotes ? (
            <p className="prose" style={{ marginTop: 10 }}>
              <strong>Notes for the client:</strong> {contract.clientNotes}
            </p>
          ) : null}
        </Card>
        <Card title="Terms">
          <DescriptionList items={termItems(contract, canSeeCost)} />
        </Card>
        {contract.internalNotes ? (
          <Card title="Internal notes" headerAddon={<Badge tone="neutral">Internal</Badge>}>
            <p className="prose">{contract.internalNotes}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/**
 * The Terms rows.
 *
 * A built array rather than conditional `<>…</>` fragments inside the list, because four of the
 * nine rows are conditional and two of those conditions are a permission — which is far easier to
 * read, and to check, as an `if` than as a ternary buried between a `<dt>` and its `<dd>`.
 */
function termItems(contract: ContractDetail, canSeeCost: boolean): DescriptionItem[] {
  const items: DescriptionItem[] = [
    {
      key: 'project',
      term: 'Project',
      description: contract.project ? (
        <Link to={`/projects/${contract.project.id}`}>{contract.project.name}</Link>
      ) : (
        'Whole client'
      ),
    },
    {
      key: 'period',
      term: 'Period',
      description: `${formatDate(contract.startDate)} → ${formatDate(contract.endDate)}`,
    },
    {
      key: 'renewal',
      term: 'Renewal',
      description: `${formatDate(contract.renewalDate)}${
        contract.autoRenew ? ' · auto-renews' : ''
      } · notice ${contract.renewalNoticeDays} days`,
    },
  ];
  if (contract.contractValue !== null) {
    items.push({
      key: 'value',
      term: 'Value',
      description: `${contract.currency} ${contract.contractValue}`,
    });
  }
  if (canSeeCost && contract.internalCost !== null) {
    items.push({
      key: 'internal-cost',
      term: 'Internal cost',
      description: (
        <>
          {contract.currency} {contract.internalCost} <Badge tone="neutral">Internal</Badge>
        </>
      ),
    });
  }
  if (contract.tracksHours) {
    items.push(
      {
        key: 'included-hours',
        term: 'Included hours',
        description: `${formatMinutes(contract.includedMinutesPerPeriod)} per ${BILLING_PERIOD_LABELS[
          contract.billingPeriod
        ].toLowerCase()}`,
      },
      {
        key: 'carry-forward',
        term: 'Carry forward',
        description: `${CARRY_FORWARD_RULE_LABELS[contract.carryForwardRule]}${
          contract.carryForwardCapMinutes
            ? ` (cap ${formatMinutes(contract.carryForwardCapMinutes)})`
            : ''
        }`,
      },
      {
        key: 'low-hours',
        term: 'Low-hours warning',
        description: `at ${formatMinutes(contract.lowHoursThresholdMinutes)}`,
      },
    );
  }
  items.push({ key: 'created-by', term: 'Created by', description: contract.createdBy.name });
  return items;
}
