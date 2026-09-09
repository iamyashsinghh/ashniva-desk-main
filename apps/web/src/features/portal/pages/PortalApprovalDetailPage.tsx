import { APPROVAL_SUBJECT_TYPE_LABELS, type PortalApprovalDetail } from '@ashniva/types';
import { Badge, Button, Card, DescriptionList, EmptyState, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ReasonModal } from '../../../shared/components/ReasonModal';
import { ApprovalStatusPill } from '../../../shared/components/StatusPills';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { useApprovalMutations, usePortalApprovalQuery } from '../../approvals/api';
import { ApprovalHistory } from '../../approvals/components/ApprovalHistory';
import { FileLink } from '../../files/components/FileLink';

type Decision = 'approve' | 'request-changes' | 'reject';

/** One approval request as the client sees it, with the three decision buttons. */
export function PortalApprovalDetailPage() {
  const { id } = useParams();
  const query = usePortalApprovalQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Body approval={query.data} /> : null}
    </QueryState>
  );
}

function Body({ approval }: { approval: PortalApprovalDetail }) {
  const { decide } = useApprovalMutations(approval.id);
  const [modal, setModal] = useState<Decision | null>(null);
  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/portal/approvals">Approvals</Link> /{' '}
            {APPROVAL_SUBJECT_TYPE_LABELS[approval.subject.type]}
          </>
        }
        title={approval.title}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ApprovalStatusPill status={approval.status} />
            {approval.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
          </span>
        }
      />
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card title="What you are approving">
            <p className="prose">{approval.summary}</p>
            <DescriptionList
              items={[
                {
                  key: 'subject',
                  term: 'Subject',
                  description: (
                    <>
                      {approval.subject.label}{' '}
                      <span className="muted">
                        · {APPROVAL_SUBJECT_TYPE_LABELS[approval.subject.type]}
                      </span>
                    </>
                  ),
                },
                {
                  key: 'project',
                  term: 'Project',
                  description: approval.project ? (
                    <Link to={`/portal/projects/${approval.project.id}`}>
                      {approval.project.name}
                    </Link>
                  ) : (
                    '—'
                  ),
                },
              ]}
            />
          </Card>
          {approval.decisionComment ? (
            <Card title="Your note">
              <p className="prose">{approval.decisionComment}</p>
            </Card>
          ) : null}
          <Card title="Files">
            {approval.files.length === 0 ? (
              <EmptyState title="No files attached" />
            ) : (
              <ul className="update-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {approval.files.map((file) => (
                  <li key={file.id} className="update-list__item">
                    <FileLink file={file} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="History">
            <ApprovalHistory history={approval.history} />
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Your decision">
            <div className="actions-card">
              {approval.canDecide ? (
                <>
                  <Button variant="accent" onClick={() => setModal('approve')}>
                    Approve
                  </Button>
                  <Button variant="secondary" onClick={() => setModal('request-changes')}>
                    Request changes
                  </Button>
                  <Button variant="danger" onClick={() => setModal('reject')}>
                    Reject
                  </Button>
                </>
              ) : (
                <p className="actions-card__hint">
                  {approval.decidedBy
                    ? `Decided by ${approval.decidedBy.name} on ${formatDate(approval.decidedAt)}.`
                    : 'Only a client administrator can decide this request.'}
                </p>
              )}
            </div>
          </Card>
          <Card title="Details">
            <DescriptionList
              items={[
                {
                  key: 'published',
                  term: 'Published',
                  description: formatDateTime(approval.publishedAt),
                },
                {
                  key: 'decision-needed-by',
                  term: 'Decision needed by',
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
        open={modal === 'approve'}
        title="Approve this request"
        label="Note for the provider"
        submitLabel="Approve"
        required={false}
        variant="accent"
        busy={decide.isPending}
        onSubmit={(comment) =>
          decide.mutateAsync({ action: 'approve', comment: comment || undefined })
        }
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'request-changes'}
        title="Request changes"
        label="What needs to change?"
        submitLabel="Send back"
        busy={decide.isPending}
        onSubmit={(comment) => decide.mutateAsync({ action: 'request-changes', comment })}
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'reject'}
        title="Reject this request"
        label="Why?"
        submitLabel="Reject"
        variant="danger"
        busy={decide.isPending}
        onSubmit={(comment) => decide.mutateAsync({ action: 'reject', comment })}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
