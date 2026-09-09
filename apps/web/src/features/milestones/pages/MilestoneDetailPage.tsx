import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_TRANSITIONS,
  PERMISSIONS,
  type MilestoneDetail,
  type MilestoneStatus,
} from '@ashniva/types';
import { Alert, Badge, Button, Card, PageHeader } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { MilestoneStatusPill } from '../../../shared/components/StatusPills';
import { errorMessage } from '../../../shared/lib/api-client';
import { RequestApprovalButton } from '../../approvals/components/RequestApprovalButton';
import { usePermission } from '../../auth/session-context';
import { useProjectQuery } from '../../projects/api';
import { useMilestoneMutations, useMilestoneQuery } from '../api';
import { MilestoneFormModal } from '../components/MilestoneFormModal';
import {
  ApprovalBadge,
  DeliverablesCard,
  LinkedTasksCard,
  MilestoneDetailsCard,
  MilestoneHistoryCard,
} from '../components/MilestonePanels';
import { ProgressBar } from '../components/MilestoneTable';
import { ProgressModal } from '../components/ProgressModal';
import { statusVariant } from '../milestone-status-variant';

import '../../dashboard/dashboard.css';

export function MilestoneDetailPage() {
  const { id } = useParams();
  const query = useMilestoneQuery(id);
  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <MilestoneBody milestone={query.data} /> : null}
    </QueryState>
  );
}

function MilestoneBody({ milestone }: { milestone: MilestoneDetail }) {
  const canManage = usePermission(PERMISSIONS.MILESTONE_MANAGE);
  const canWork = usePermission(PERMISSIONS.TASK_WORK);
  const project = useProjectQuery(milestone.project.id);
  const { changeStatus, setDeliverable } = useMilestoneMutations(milestone.id);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const nextStatuses = MILESTONE_TRANSITIONS[milestone.status];

  async function move(status: MilestoneStatus) {
    setError(undefined);
    try {
      await changeStatus.mutateAsync({ status });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/projects">Projects</Link> /{' '}
            <Link to={`/projects/${milestone.project.id}?tab=milestones`}>
              {milestone.project.code}
            </Link>{' '}
            / Milestone
          </>
        }
        title={milestone.name}
        subtitle={
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <MilestoneStatusPill status={milestone.status} />
            {milestone.clientVisible ? (
              <Badge tone="success">Client-visible</Badge>
            ) : (
              <Badge tone="neutral">Internal</Badge>
            )}
            {milestone.requiresApproval ? (
              <ApprovalBadge status={milestone.approvalStatus} />
            ) : null}
            {milestone.isOverdue ? <Badge tone="danger">Overdue</Badge> : null}
          </span>
        }
        actions={
          canManage ? (
            <>
              {milestone.requiresApproval && milestone.clientVisible ? (
                <RequestApprovalButton
                  subjectType="MILESTONE"
                  subjectId={milestone.id}
                  title={`Sign off: ${milestone.name}`}
                />
              ) : null}
              <Button onClick={() => setAdjusting(true)}>Adjust progress</Button>
              <Button variant="primary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="detail-page__grid">
        <div className="detail-page__column">
          <Card
            title="Progress"
            headerAddon={
              <span className="muted">
                {milestone.progressMode === 'MANUAL'
                  ? 'Set manually'
                  : 'From deliverables and tasks'}
              </span>
            }
          >
            <ProgressBar
              percent={milestone.progressPercent}
              warn={milestone.isOverdue}
              label={`Progress on ${milestone.name}`}
            />
            {milestone.description ? (
              <p className="prose" style={{ marginTop: 10 }}>
                {milestone.description}
              </p>
            ) : null}
          </Card>
          <DeliverablesCard
            milestone={milestone}
            canWork={canWork}
            onToggle={(deliverableId, isDone) =>
              void setDeliverable
                .mutateAsync({ deliverableId, isDone })
                .catch((cause: unknown) => setError(errorMessage(cause)))
            }
          />
          <LinkedTasksCard milestone={milestone} />
          <MilestoneHistoryCard milestone={milestone} />
        </div>
        <div className="detail-page__column detail-page__column--aside">
          <Card title="Actions for your role">
            <div className="actions-card">
              {nextStatuses.length === 0 ? (
                <p className="actions-card__hint">
                  This milestone is {MILESTONE_STATUS_LABELS[milestone.status].toLowerCase()}.
                </p>
              ) : null}
              {nextStatuses.map((status) => (
                <Button
                  key={status}
                  variant={statusVariant(status)}
                  disabled={!canManage}
                  disabledReason="Only managers move milestones"
                  loading={changeStatus.isPending}
                  onClick={() => void move(status)}
                >
                  {MILESTONE_STATUS_LABELS[status]}
                </Button>
              ))}
              {error ? <Alert tone="danger">{error}</Alert> : null}
            </div>
          </Card>
          <MilestoneDetailsCard milestone={milestone} />
        </div>
      </div>
      {editing ? (
        <MilestoneFormModal
          projectId={milestone.project.id}
          clientOrganizationId={project.data?.clientOrganization?.id ?? null}
          milestone={milestone}
          onClose={() => setEditing(false)}
        />
      ) : null}
      {adjusting ? (
        <ProgressModal milestone={milestone} onClose={() => setAdjusting(false)} />
      ) : null}
    </div>
  );
}
