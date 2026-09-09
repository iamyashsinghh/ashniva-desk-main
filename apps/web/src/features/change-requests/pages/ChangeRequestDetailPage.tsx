import {
  CHANGE_REQUEST_ACTION,
  CHANGE_REQUEST_STATUS,
  PERMISSIONS,
  type ChangeRequestAction,
  type ChangeRequestDetail,
} from '@ashniva/types';
import { Badge, Button, Card, DescriptionList, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { ChangeRequestStatusPill } from '../../../shared/components/StatusPills';
import { WorkflowActions, type ActionSpec } from '../../../shared/components/WorkflowActions';
import { errorMessage } from '../../../shared/lib/api-client';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { FileList } from '../../files/components/FileList';
import { useChangeRequestMutations, useChangeRequestQuery } from '../api';
import { ChangeRequestFormModal } from '../components/ChangeRequestFormModal';
import { EstimateModal, ScheduleModal } from '../components/ChangeRequestModals';
import { GenerateTasksModal } from '../components/GenerateTasksModal';
import {
  ChangeRequestHistory,
  ChangeRequestImpact,
  ChangeRequestLinkedWork,
  ChangeRequestOverview,
} from '../components/ChangeRequestPanels';
import { ChangeRequestReasonModals, type NoteStep } from '../components/ChangeRequestReasonModals';
import { ChangeRequestThread } from '../components/ChangeRequestThread';

const A = CHANGE_REQUEST_ACTION;
const SPECS: ActionSpec<ChangeRequestAction>[] = [
  { action: A.SUBMIT, label: 'Submit', variant: 'primary' },
  { action: A.START_INTERNAL_REVIEW, label: 'Start internal review', variant: 'primary' },
  { action: A.SEND_TO_CLIENT, label: 'Send to client for approval', variant: 'accent' },
  { action: A.GENERATE_TASKS, label: 'Create tasks & milestone', variant: 'primary' },
  { action: A.SCHEDULE, label: 'Schedule', variant: 'primary' },
  { action: A.COMPLETE, label: 'Mark completed', variant: 'accent' },
  { action: A.EDIT, label: 'Edit', variant: 'secondary' },
  { action: A.REQUEST_CHANGES, label: 'Request changes', variant: 'secondary' },
  { action: A.REOPEN_DRAFT, label: 'Back to draft', variant: 'secondary' },
  { action: A.REJECT, label: 'Reject', variant: 'danger' },
  { action: A.CANCEL, label: 'Cancel request', variant: 'ghost' },
];

const NOTE_STEPS: NoteStep[] = [
  'send-to-client',
  'request-changes',
  'reject',
  'cancel',
  'complete',
];

type Modal = 'edit' | 'estimate' | 'schedule' | 'tasks' | NoteStep | null;

export function ChangeRequestDetailPage() {
  const { id } = useParams();
  const query = useChangeRequestQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <ChangeRequestBody cr={query.data} /> : null}
    </QueryState>
  );
}

function ChangeRequestBody({ cr }: { cr: ChangeRequestDetail }) {
  const canManage = usePermission(PERMISSIONS.CHANGE_REQUEST_MANAGE);
  const { step } = useChangeRequestMutations(cr.id);
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState<string | undefined>();
  const closed =
    cr.status === CHANGE_REQUEST_STATUS.COMPLETED ||
    cr.status === CHANGE_REQUEST_STATUS.REJECTED ||
    cr.status === CHANGE_REQUEST_STATUS.CANCELLED;

  async function run(action: ChangeRequestAction) {
    setError(undefined);
    const modals: Partial<Record<ChangeRequestAction, Modal>> = {
      edit: 'edit',
      schedule: 'schedule',
      'generate-tasks': 'tasks',
      'send-to-client': 'send-to-client',
      'request-changes': 'request-changes',
      reject: 'reject',
      cancel: 'cancel',
      complete: 'complete',
    };
    const target = modals[action];
    if (target) {
      setModal(target);
      return;
    }
    if (action === A.SUBMIT || action === A.START_INTERNAL_REVIEW || action === A.REOPEN_DRAFT) {
      try {
        await step.mutateAsync({ step: action });
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
            <Link to="/change-requests">Change requests</Link> / {cr.number}
          </>
        }
        title={cr.title}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ChangeRequestStatusPill status={cr.status} />
            <span className="muted">· {cr.clientOrganization.name}</span>
            {cr.status === CHANGE_REQUEST_STATUS.CLIENT_REVIEW ? (
              <Badge tone="review">Waiting for the client</Badge>
            ) : null}
          </span>
        }
      />
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <ChangeRequestOverview cr={cr} />
          <ChangeRequestImpact
            cr={cr}
            actions={
              canManage && !closed ? (
                <Button size="sm" onClick={() => setModal('estimate')}>
                  Estimate
                </Button>
              ) : undefined
            }
          />
          {cr.internalNotes ? (
            <Card title="Internal notes" headerAddon={<Badge tone="neutral">Internal</Badge>}>
              <p className="prose">{cr.internalNotes}</p>
            </Card>
          ) : null}
          <ChangeRequestLinkedWork cr={cr} />
          <ChangeRequestThread
            changeRequestId={cr.id}
            comments={cr.comments}
            canInternal
            canReply={!closed}
            replyBlockedReason="This request is closed"
          />
          <Card title="Files">
            <FileList
              files={cr.files}
              parent={{ changeRequestId: cr.id }}
              canUpload={!closed}
              chooseVisibility
            />
          </Card>
          <Card title="History">
            <ChangeRequestHistory history={cr.history} />
          </Card>
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Actions for your role">
            <WorkflowActions
              availability={cr.actions}
              specs={SPECS}
              onAction={(action) => void run(action)}
              busy={step.isPending}
              error={error}
              emptyHint={closed ? 'This request is closed.' : 'Waiting for the other side.'}
            />
          </Card>
          <Card title="Details">
            <DescriptionList
              items={[
                { key: 'number', term: 'Number', description: cr.number },
                { key: 'client', term: 'Client', description: cr.clientOrganization.name },
                {
                  key: 'project',
                  term: 'Project',
                  description: cr.project ? (
                    <Link to={`/projects/${cr.project.id}`}>{cr.project.name}</Link>
                  ) : (
                    '—'
                  ),
                },
                {
                  key: 'contract',
                  term: 'Contract',
                  description: cr.contract ? (
                    <Link to={`/contracts/${cr.contract.id}`}>{cr.contract.number}</Link>
                  ) : (
                    '—'
                  ),
                },
                { key: 'requested-by', term: 'Requested by', description: cr.requestedBy.name },
                { key: 'raised-by', term: 'Raised by', description: cr.createdBy.name },
                {
                  key: 'submitted',
                  term: 'Submitted',
                  description: formatDateTime(cr.submittedAt),
                },
                { key: 'approved', term: 'Approved', description: formatDateTime(cr.approvedAt) },
                {
                  key: 'completed',
                  term: 'Completed',
                  description: formatDateTime(cr.completedAt),
                },
                { key: 'linked-tasks', term: 'Linked tasks', description: cr.linkedTaskCount },
              ]}
            />
          </Card>
        </div>
      </div>
      {modal === 'edit' ? (
        <ChangeRequestFormModal existing={cr} onClose={() => setModal(null)} />
      ) : null}
      {modal === 'estimate' ? <EstimateModal cr={cr} onClose={() => setModal(null)} /> : null}
      {modal === 'schedule' ? <ScheduleModal cr={cr} onClose={() => setModal(null)} /> : null}
      {modal === 'tasks' ? <GenerateTasksModal cr={cr} onClose={() => setModal(null)} /> : null}
      <ChangeRequestReasonModals
        open={NOTE_STEPS.includes(modal as NoteStep) ? (modal as NoteStep) : null}
        busy={step.isPending}
        onSubmit={(noteStep, note) => step.mutateAsync({ step: noteStep, note: note || undefined })}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
