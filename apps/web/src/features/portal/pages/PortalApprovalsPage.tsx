import {
  APPROVAL_STATUS,
  APPROVAL_SUBJECT_TYPE_LABELS,
  type PortalApprovalSummary,
} from '@ashniva/types';
import { Badge, Card, EmptyState, PageHeader } from '@ashniva/ui';
import { Link } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ApprovalStatusPill } from '../../../shared/components/StatusPills';
import { formatDate } from '../../../shared/lib/format';
import { usePortalApprovalsQuery } from '../../approvals/api';

import '../../dashboard/dashboard.css';

/** Client approval inbox: what needs a decision, then everything already decided. */
export function PortalApprovalsPage() {
  const approvals = usePortalApprovalsQuery();
  const waiting = (approvals.data ?? []).filter(
    (entry) => entry.status === APPROVAL_STATUS.PUBLISHED,
  );
  const decided = (approvals.data ?? []).filter(
    (entry) => entry.status !== APPROVAL_STATUS.PUBLISHED,
  );
  return (
    <div className="dashboard">
      <PageHeader
        title="Approvals"
        subtitle="Milestones, documents, updates and change proposals waiting for your decision."
      />
      <QueryState
        isLoading={approvals.isLoading}
        isError={approvals.isError}
        error={approvals.error}
        onRetry={() => void approvals.refetch()}
      >
        <>
          <Card
            title="Waiting for you"
            headerAddon={
              waiting.length > 0 ? <Badge tone="review">{waiting.length}</Badge> : undefined
            }
          >
            {waiting.length === 0 ? (
              <EmptyState title="Nothing to approve right now" />
            ) : (
              <ApprovalRows approvals={waiting} />
            )}
          </Card>
          <Card title="Already decided">
            {decided.length === 0 ? (
              <EmptyState title="No decisions yet" />
            ) : (
              <ApprovalRows approvals={decided} />
            )}
          </Card>
        </>
      </QueryState>
    </div>
  );
}

function ApprovalRows({ approvals }: { approvals: PortalApprovalSummary[] }) {
  return (
    <ul className="update-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {approvals.map((approval) => (
        <li key={approval.id} className="update-list__item">
          <Link to={`/portal/approvals/${approval.id}`}>
            <strong>{approval.title}</strong>
          </Link>
          <span className="update-list__meta">
            {APPROVAL_SUBJECT_TYPE_LABELS[approval.subject.type]}
            {approval.project ? ` · ${approval.project.name}` : ''}
            {approval.dueDate ? ` · needed by ${formatDate(approval.dueDate)}` : ''}
          </span>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <ApprovalStatusPill status={approval.status} />
            {approval.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
            {approval.decidedBy ? (
              <span className="muted">
                {approval.decidedBy.name} · {formatDate(approval.decidedAt)}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
