import { CONTRACT_TYPE_LABELS, type PortalContractDetail } from '@ashniva/types';
import { Badge, Card, DescriptionList, EmptyState, PageHeader } from '@ashniva/ui';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ContractStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';
import { usePortalContractQuery } from '../../contracts/api';
import { HoursSummary, LedgerTable } from '../../contracts/components/HoursPanel';
import { FileLink } from '../../files/components/FileLink';
import { MilestoneTable } from '../../milestones/components/MilestoneTable';

import '../../dashboard/dashboard.css';

/** One contract as the client sees it: scope, dates, hour balance, milestones and documents. */
export function PortalContractDetailPage() {
  const { id } = useParams();
  const query = usePortalContractQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Body contract={query.data} /> : null}
    </QueryState>
  );
}

function Body({ contract }: { contract: PortalContractDetail }) {
  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/portal/contracts">Contracts</Link> / {contract.number}
          </>
        }
        title={contract.title}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ContractStatusPill status={contract.status} />
            <span className="muted">· {CONTRACT_TYPE_LABELS[contract.type]}</span>
            {contract.isExpiringSoon ? <Badge tone="warning">Expiring soon</Badge> : null}
          </span>
        }
      />
      {contract.hours ? (
        <Card title="Support hours this period">
          <HoursSummary hours={contract.hours} />
        </Card>
      ) : null}
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card title="Scope">
            {contract.scope ? (
              <p className="prose">{contract.scope}</p>
            ) : (
              <EmptyState title="No scope recorded" />
            )}
            {contract.clientNotes ? (
              <p className="prose" style={{ marginTop: 10 }}>
                {contract.clientNotes}
              </p>
            ) : null}
          </Card>
          {contract.milestones.length > 0 ? (
            <Card title="Milestones">
              <MilestoneTable
                milestones={contract.milestones}
                showProject={false}
                showVisibility={false}
                linkBase={null}
              />
            </Card>
          ) : null}
          {contract.hours ? (
            <Card title="Recent hour movements">
              <LedgerTable entries={contract.recentLedger} linkTasks={false} />
            </Card>
          ) : null}
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Details">
            <DescriptionList
              items={[
                { key: 'number', term: 'Number', description: contract.number },
                {
                  key: 'project',
                  term: 'Project',
                  description: contract.project ? (
                    <Link to={`/portal/projects/${contract.project.id}`}>
                      {contract.project.name}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
                { key: 'starts', term: 'Starts', description: formatDate(contract.startDate) },
                {
                  key: 'ends',
                  term: 'Ends',
                  description: contract.endDate ? formatDate(contract.endDate) : 'Open-ended',
                },
                { key: 'renews', term: 'Renews', description: formatDate(contract.renewalDate) },
              ]}
            />
          </Card>
          <Card title="Documents">
            {contract.documents.length === 0 ? (
              <EmptyState title="No documents shared yet" />
            ) : (
              <ul className="update-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {contract.documents.map((file) => (
                  <li key={file.id} className="update-list__item">
                    <FileLink file={file} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
