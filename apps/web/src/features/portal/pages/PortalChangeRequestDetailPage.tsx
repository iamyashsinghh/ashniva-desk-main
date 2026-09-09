import { CHANGE_REQUEST_STATUS, type PortalChangeRequestDetail } from '@ashniva/types';
import { Alert, Badge, Button, Card, DescriptionList, EmptyState, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ReasonModal } from '../../../shared/components/ReasonModal';
import { ChangeRequestStatusPill } from '../../../shared/components/StatusPills';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { useChangeRequestMutations, usePortalChangeRequestQuery } from '../../change-requests/api';
import { ChangeRequestFormModal } from '../../change-requests/components/ChangeRequestFormModal';
import {
  ChangeRequestHistory,
  ChangeRequestImpact,
  ChangeRequestOverview,
} from '../../change-requests/components/ChangeRequestPanels';
import { ChangeRequestThread } from '../../change-requests/components/ChangeRequestThread';
import { FileLink } from '../../files/components/FileLink';

type Modal = 'edit' | 'submit' | 'cancel' | 'approve' | 'request-changes' | 'reject' | null;

/** The client's own view: what they asked for, what it costs, and their decision buttons. */
export function PortalChangeRequestDetailPage() {
  const { id } = useParams();
  const query = usePortalChangeRequestQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Body cr={query.data} /> : null}
    </QueryState>
  );
}

function Body({ cr }: { cr: PortalChangeRequestDetail }) {
  const { step } = useChangeRequestMutations(cr.id, true);
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState<string | undefined>();
  const isDraft = cr.status === CHANGE_REQUEST_STATUS.DRAFT;
  const waitingForUs = cr.status === CHANGE_REQUEST_STATUS.CLIENT_REVIEW;

  async function submit() {
    setError(undefined);
    try {
      await step.mutateAsync({ step: 'submit' });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/portal/change-requests">Change requests</Link> / {cr.number}
          </>
        }
        title={cr.title}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ChangeRequestStatusPill status={cr.status} />
            {waitingForUs ? <Badge tone="review">Your decision is needed</Badge> : null}
          </span>
        }
      />
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <ChangeRequestOverview cr={cr} />
          <ChangeRequestImpact cr={cr} />
          <ChangeRequestThread
            changeRequestId={cr.id}
            comments={cr.comments}
            canInternal={false}
            canReply={cr.canReply}
            replyBlockedReason="This request is closed"
            portal
          />
          <Card title="Files">
            {cr.files.length === 0 ? (
              <EmptyState title="No files" />
            ) : (
              <ul className="update-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {cr.files.map((file) => (
                  <li key={file.id} className="update-list__item">
                    <FileLink file={file} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="History">
            <ChangeRequestHistory history={cr.history} />
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="What you can do">
            <div className="actions-card">
              {isDraft ? (
                <>
                  <Button variant="primary" loading={step.isPending} onClick={() => void submit()}>
                    Submit to the provider
                  </Button>
                  <Button variant="secondary" onClick={() => setModal('edit')}>
                    Edit
                  </Button>
                </>
              ) : null}
              {cr.canApprove ? (
                <Button variant="accent" onClick={() => setModal('approve')}>
                  Approve
                </Button>
              ) : null}
              {cr.canRequestChanges ? (
                <Button variant="secondary" onClick={() => setModal('request-changes')}>
                  Ask for changes
                </Button>
              ) : null}
              {cr.canApprove ? (
                <Button variant="danger" onClick={() => setModal('reject')}>
                  Reject
                </Button>
              ) : null}
              {isDraft || cr.status === CHANGE_REQUEST_STATUS.SUBMITTED ? (
                <Button variant="ghost" onClick={() => setModal('cancel')}>
                  Cancel this request
                </Button>
              ) : null}
              {!isDraft && !cr.canApprove && !cr.canRequestChanges ? (
                <p className="actions-card__hint">The provider is working on this request.</p>
              ) : null}
              {error ? <Alert tone="danger">{error}</Alert> : null}
            </div>
          </Card>
          <Card title="Details">
            <DescriptionList
              items={[
                { key: 'number', term: 'Number', description: cr.number },
                {
                  key: 'project',
                  term: 'Project',
                  description: cr.project ? (
                    <Link to={`/portal/projects/${cr.project.id}`}>{cr.project.name}</Link>
                  ) : (
                    '—'
                  ),
                },
                { key: 'requested-by', term: 'Requested by', description: cr.requestedBy.name },
                {
                  key: 'submitted',
                  term: 'Submitted',
                  description: formatDateTime(cr.submittedAt),
                },
              ]}
            />
          </Card>
        </div>
      </div>
      {modal === 'edit' ? (
        <ChangeRequestFormModal
          portal
          existing={{ ...cr, project: cr.project }}
          onClose={() => setModal(null)}
        />
      ) : null}
      <ReasonModal
        open={modal === 'approve'}
        title="Approve this change"
        label="Note for the provider"
        submitLabel="Approve"
        required={false}
        variant="accent"
        busy={step.isPending}
        onSubmit={(note) => step.mutateAsync({ step: 'approve', note: note || undefined })}
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'request-changes'}
        title="Ask for changes"
        label="What should be different?"
        submitLabel="Send back"
        busy={step.isPending}
        onSubmit={(note) => step.mutateAsync({ step: 'request-changes', note })}
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'reject'}
        title="Reject this change"
        label="Why?"
        submitLabel="Reject"
        variant="danger"
        busy={step.isPending}
        onSubmit={(note) => step.mutateAsync({ step: 'reject', note })}
        onClose={() => setModal(null)}
      />
      <ReasonModal
        open={modal === 'cancel'}
        title="Cancel this request"
        label="Why?"
        submitLabel="Cancel request"
        variant="danger"
        busy={step.isPending}
        onSubmit={(note) => step.mutateAsync({ step: 'cancel', note })}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
