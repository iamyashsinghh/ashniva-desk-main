import {
  CONTRACT_STATUS,
  CONTRACT_TYPE_LABELS,
  PERMISSIONS,
  type ContractDetail,
} from '@ashniva/types';
import { Alert, Badge, Button, Card, EmptyState, FormActions, PageHeader, Tabs } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ContractStatusPill } from '../../../shared/components/StatusPills';
import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useChangeRequestsQuery } from '../../change-requests/api';
import { FileList } from '../../files/components/FileList';
import { MilestoneFormModal } from '../../milestones/components/MilestoneFormModal';
import { MilestoneTable } from '../../milestones/components/MilestoneTable';
import { useContractMutations, useContractQuery } from '../api';
import { ContractFormModal } from '../components/ContractFormModal';
import { ContractOverview } from '../components/ContractOverview';
import { HourMovementModal, HoursSummary, LedgerCard } from '../components/HoursPanel';
import { PaymentMilestones } from '../components/PaymentMilestones';

import '../../dashboard/dashboard.css';

type Tab = 'overview' | 'hours' | 'milestones' | 'payments' | 'documents' | 'changes';

export function ContractDetailPage() {
  const { id } = useParams();
  const query = useContractQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <ContractBody contract={query.data} /> : null}
    </QueryState>
  );
}

function ContractBody({ contract }: { contract: ContractDetail }) {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') ?? 'overview') as Tab;
  const canManage = usePermission(PERMISSIONS.CONTRACT_MANAGE);
  const canAdjust = usePermission(PERMISSIONS.CONTRACT_ADJUST_HOURS);
  const canManageMilestones = usePermission(PERMISSIONS.MILESTONE_MANAGE);
  const canSeeCost = usePermission(PERMISSIONS.COST_READ);
  const { archive } = useContractMutations(contract.id);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const changeRequests = useChangeRequestsQuery({ contractId: contract.id }, tab === 'changes');
  const periods = [...new Set(contract.recentLedger.map((entry) => entry.periodStart))];
  const readOnly = contract.status === CONTRACT_STATUS.ARCHIVED;

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/contracts">Contracts</Link> / {contract.number}
          </>
        }
        title={contract.title}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ContractStatusPill status={contract.status} />
            <span>{CONTRACT_TYPE_LABELS[contract.type]}</span>
            <span className="muted">· {contract.clientOrganization.name}</span>
            {contract.isExpiringSoon ? <Badge tone="warning">Expiring soon</Badge> : null}
          </span>
        }
        actions={
          canManage && !readOnly ? (
            <>
              <Button
                variant="ghost"
                loading={archive.isPending}
                onClick={() =>
                  void archive
                    .mutateAsync()
                    .catch((cause: unknown) => setError(errorMessage(cause)))
                }
              >
                Archive
              </Button>
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          ) : undefined
        }
      >
        <Tabs
          aria-label="Contract sections"
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          items={[
            { key: 'overview', label: 'Overview' },
            ...(contract.tracksHours ? [{ key: 'hours' as const, label: 'Support hours' }] : []),
            { key: 'milestones', label: 'Milestones', count: contract.milestones.length },
            { key: 'payments', label: 'Payments', count: contract.paymentMilestones.length },
            { key: 'documents', label: 'Documents', count: contract.documents.length },
            { key: 'changes', label: 'Change requests', count: contract.openChangeRequestCount },
          ]}
        />
      </PageHeader>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {tab === 'overview' ? <ContractOverview contract={contract} canSeeCost={canSeeCost} /> : null}

      {tab === 'hours' ? (
        <>
          {contract.hours ? (
            <HoursSummary hours={contract.hours} />
          ) : (
            <EmptyState title="Hours are tracked once the contract is active" />
          )}
          {canAdjust && !readOnly ? (
            <FormActions>
              <Button variant="primary" onClick={() => setAdjusting(true)}>
                Adjust hours
              </Button>
            </FormActions>
          ) : null}
          <LedgerCard contractId={contract.id} periods={periods} />
        </>
      ) : null}

      {tab === 'milestones' ? (
        <>
          {canManageMilestones && contract.project ? (
            <FormActions>
              <Button onClick={() => setAddingMilestone(true)}>+ Milestone</Button>
            </FormActions>
          ) : null}
          <MilestoneTable
            milestones={contract.milestones}
            emptyTitle="No milestones on this contract"
          />
        </>
      ) : null}

      {tab === 'payments' ? (
        <Card title="Payment milestones">
          <PaymentMilestones
            contract={contract}
            canManage={canManage && !readOnly}
            showAmounts={contract.contractValue !== null || canSeeCost}
          />
        </Card>
      ) : null}

      {tab === 'documents' ? (
        <Card
          title="Documents"
          headerAddon={<span className="muted">Client-visible files appear in the portal</span>}
        >
          <FileList
            files={contract.documents}
            parent={{ contractId: contract.id }}
            canUpload={canManage && !readOnly}
            chooseVisibility
          />
        </Card>
      ) : null}

      {tab === 'changes' ? (
        <Card
          title="Change requests"
          headerAddon={<Link to={`/change-requests?contractId=${contract.id}`}>Open the list</Link>}
        >
          {changeRequests.data && changeRequests.data.items.length > 0 ? (
            <ul className="update-list">
              {changeRequests.data.items.map((cr) => (
                <li key={cr.id} className="update-list__item">
                  <Link to={`/change-requests/${cr.id}`}>
                    {cr.number} {cr.title}
                  </Link>
                  <span className="update-list__meta">
                    {cr.status.toLowerCase().replace('_', ' ')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No change requests against this contract" />
          )}
        </Card>
      ) : null}

      {editing ? <ContractFormModal contract={contract} onClose={() => setEditing(false)} /> : null}
      {adjusting ? (
        <HourMovementModal contractId={contract.id} onClose={() => setAdjusting(false)} />
      ) : null}
      {addingMilestone && contract.project ? (
        <MilestoneFormModal
          projectId={contract.project.id}
          clientOrganizationId={contract.clientOrganization.id}
          defaultContractId={contract.id}
          onClose={() => setAddingMilestone(false)}
        />
      ) : null}
    </div>
  );
}
