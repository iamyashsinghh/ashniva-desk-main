import {
  APPROVAL_ACTION,
  APPROVAL_SUBJECT_TYPE_LABELS,
  PERMISSIONS,
  type ApprovalAction,
  type ApprovalDetail,
} from '@ashniva/types';
import { Badge, Card, DescriptionList, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ReasonModal } from '../../../shared/components/ReasonModal';
import { ApprovalStatusPill } from '../../../shared/components/StatusPills';
import { WorkflowActions, type ActionSpec } from '../../../shared/components/WorkflowActions';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { FileList } from '../../files/components/FileList';
import { useApprovalMutations, useApprovalQuery } from '../api';
import { ApprovalHistory } from '../components/ApprovalHistory';
import { EditApprovalModal } from '../components/EditApprovalModal';

const SPECS: ActionSpec<ApprovalAction>[] = [
  {
    action: APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW,
    label: 'Send to internal review',
    variant: 'primary',
  },
  { action: APPROVAL_ACTION.PUBLISH, label: 'Publish to client', variant: 'accent' },
  { action: APPROVAL_ACTION.RETURN_TO_DRAFT, label: 'Back to draft', variant: 'secondary' },
  { action: APPROVAL_ACTION.EDIT, label: 'Edit', variant: 'secondary' },
  { action: APPROVAL_ACTION.WITHDRAW, label: 'Withdraw', variant: 'ghost' },
];

export function ApprovalDetailPage() {
  const { id } = useParams();
  const query = useApprovalQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <ApprovalBody approval={query.data} /> : null}
    </QueryState>
  );
}

function ApprovalBody({ approval }: { approval: ApprovalDetail }) {
  const canManage = usePermission(PERMISSIONS.APPROVAL_MANAGE);
  const { transition } = useApprovalMutations(approval.id);
  const [modal, setModal] = useState<'withdraw' | 'edit' | null>(null);
  const [error, setError] = useState<string | undefined>();

  async function run(action: ApprovalAction) {
    setError(undefined);
    if (action === APPROVAL_ACTION.WITHDRAW) {
      setModal('withdraw');
      return;
    }
    if (action === APPROVAL_ACTION.EDIT) {
      setModal('edit');
      return;
    }
    if (
      action === APPROVAL_ACTION.SEND_TO_INTERNAL_REVIEW ||
      action === APPROVAL_ACTION.PUBLISH ||
      action === APPROVAL_ACTION.RETURN_TO_DRAFT
    ) {
      try {
        await transition.mutateAsync({ action });
      } catch (cause) {
        setError(errorMessage(cause));
      }
    }
  }

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/approvals">Approvals</Link> /{' '}
            {APPROVAL_SUBJECT_TYPE_LABELS[approval.subject.type]}
          </>
        }
        title={approval.title}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ApprovalStatusPill status={approval.status} />
            <span className="muted">· {approval.clientOrganization.name}</span>
            {approval.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
          </span>
        }
      />
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card
            title="What the client is approving"
            headerAddon={<Badge tone="success">Client-visible</Badge>}
          >
            <p className="prose">{approval.summary}</p>
            <DescriptionList
              items={[
                {
                  key: 'subject',
                  term: 'Subject',
                  description: (
                    <>
                      {approval.subject.link ? (
                        <Link to={approval.subject.link}>{approval.subject.label}</Link>
                      ) : (
                        approval.subject.label
                      )}
                      <span className="muted">
                        {' '}
                        · {APPROVAL_SUBJECT_TYPE_LABELS[approval.subject.type]}
                      </span>
                    </>
                  ),
                },
              ]}
            />
          </Card>
          {approval.decisionComment ? (
            <Card
              title="Client’s decision"
              headerAddon={<Badge tone="review">From the client</Badge>}
            >
              <p className="prose">{approval.decisionComment}</p>
            </Card>
          ) : null}
          {approval.internalNotes ? (
            <Card title="Internal notes" headerAddon={<Badge tone="neutral">Internal</Badge>}>
              <p className="prose">{approval.internalNotes}</p>
            </Card>
          ) : null}
          <Card title="Files">
            <FileList
              files={approval.files}
              parent={{ approvalId: approval.id }}
              canUpload={canManage && approval.status === 'DRAFT'}
              chooseVisibility
            />
          </Card>
          <Card title="History">
            <ApprovalHistory history={approval.history} />
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Actions for your role">
            <WorkflowActions
              availability={approval.actions}
              specs={SPECS}
              onAction={(action) => void run(action)}
              busy={transition.isPending}
              error={error}
              emptyHint="Waiting for the client."
            />
          </Card>
          <Card title="Details">
            <DescriptionList
              items={[
                { key: 'client', term: 'Client', description: approval.clientOrganization.name },
                {
                  key: 'project',
                  term: 'Project',
                  description: approval.project ? (
                    <Link to={`/projects/${approval.project.id}`}>{approval.project.name}</Link>
                  ) : (
                    '—'
                  ),
                },
                {
                  key: 'contract',
                  term: 'Contract',
                  description: approval.contract ? (
                    <Link to={`/contracts/${approval.contract.id}`}>
                      {approval.contract.number}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
                {
                  key: 'requested-by',
                  term: 'Requested by',
                  description: approval.requestedBy.name,
                },
                {
                  key: 'reviewed-by',
                  term: 'Reviewed by',
                  description: approval.internalReviewer
                    ? `${approval.internalReviewer.name} · ${formatDateTime(approval.internalReviewedAt)}`
                    : '—',
                },
                {
                  key: 'published',
                  term: 'Published',
                  description: approval.publishedBy
                    ? `${approval.publishedBy.name} · ${formatDateTime(approval.publishedAt)}`
                    : '—',
                },
                {
                  key: 'decision-by',
                  term: 'Decision by',
                  description: formatDate(approval.dueDate),
                },
                {
                  key: 'decided',
                  term: 'Decided',
                  description: approval.decidedBy
                    ? `${approval.decidedBy.name} · ${formatDateTime(approval.decidedAt)}`
                    : '—',
                },
              ]}
            />
          </Card>
        </div>
      </div>
      <ReasonModal
        open={modal === 'withdraw'}
        title="Withdraw this request"
        label="Why?"
        submitLabel="Withdraw"
        variant="danger"
        required={false}
        busy={transition.isPending}
        onSubmit={(comment) =>
          transition.mutateAsync({ action: 'withdraw', comment: comment || undefined })
        }
        onClose={() => setModal(null)}
      />
      {modal === 'edit' ? (
        <EditApprovalModal approval={approval} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}
