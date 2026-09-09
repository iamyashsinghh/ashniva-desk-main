import { TESTING_ASSIGNMENT_KIND, type TestingAssignmentDetail } from '@ashniva/types';
import { Card, DescriptionList, PageHeader, StatusPill } from '@ashniva/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { QueryState } from '../../../shared/components/QueryState';
import { formatDate, formatDateTime } from '../../../shared/lib/format';
import { useTestingAssignment } from '../api';
import { AssignmentActions } from '../components/AssignmentActions';
import { CredentialGrantCard } from '../components/CredentialGrantCard';
import { LiveVerificationChecklist } from '../components/LiveVerificationChecklist';
import { TestContextCard } from '../components/TestContextCard';
import { TestResultForm } from '../components/TestResultForm';
import { TestResultHistory } from '../components/TestResultHistory';
import {
  ASSIGNMENT_KIND_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_TONES,
  ENVIRONMENT_LABELS,
} from '../qa-labels';

import '../../dashboard/dashboard.css';
import '../qa.css';

/** One testing assignment: the handover, the test login, the actions and the result history. */
export function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useTestingAssignment(id);

  return (
    <QueryState
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      onRetry={() => void query.refetch()}
    >
      {query.data ? <Loaded assignment={query.data} /> : null}
    </QueryState>
  );
}

function Loaded({ assignment }: { assignment: TestingAssignmentDetail }) {
  const [recording, setRecording] = useState(false);
  const isLive = assignment.kind === TESTING_ASSIGNMENT_KIND.LIVE_VERIFICATION;

  return (
    <div className="detail-page">
      <PageHeader
        crumbs={
          <>
            <Link to="/qa">Testing</Link> / {ASSIGNMENT_KIND_LABELS[assignment.kind]}
          </>
        }
        title={assignment.subjectLabel}
        subtitle={
          <span className="qa-subtitle">
            <StatusPill
              tone={ASSIGNMENT_STATUS_TONES[assignment.status]}
              label={ASSIGNMENT_STATUS_LABELS[assignment.status]}
            />
            <span>{ASSIGNMENT_KIND_LABELS[assignment.kind]}</span>
            <span className="muted">
              · {ENVIRONMENT_LABELS[assignment.environment]} ·{' '}
              <Link to={`/projects/${assignment.projectId}`}>{assignment.projectName}</Link>
            </span>
          </span>
        }
      />

      <div className="detail-page__grid">
        <div className="detail-page__column">
          <TestContextCard assignment={assignment} />
          <TestResultHistory results={assignment.results} />
        </div>

        <div className="detail-page__column detail-page__column--aside">
          {isLive ? (
            <LiveVerificationChecklist
              assignment={assignment}
              onReportFailure={() => setRecording(true)}
            />
          ) : null}
          <AssignmentActions
            assignment={assignment}
            onRecordResult={() => setRecording(true)}
            hideRecordResult={isLive}
          />
          <CredentialGrantCard assignment={assignment} />

          <Card title="Details">
            <DescriptionList
              items={[
                {
                  key: 'due',
                  term: 'Due',
                  description: (
                    <span className={assignment.isOverdue ? 'due--overdue' : undefined}>
                      {formatDate(assignment.dueAt)}
                      {assignment.isOverdue ? ' · overdue' : ''}
                    </span>
                  ),
                },
                {
                  key: 'tester',
                  term: 'Tester',
                  description:
                    assignment.assignedToName ?? 'Unassigned — anyone in QA can pick this up',
                },
                {
                  key: 'handed-over-by',
                  term: 'Handed over by',
                  description: assignment.assignedByName,
                },
                {
                  key: 'started',
                  term: 'Started',
                  description: formatDateTime(assignment.startedAt),
                },
                {
                  key: 'finished',
                  term: 'Finished',
                  description: formatDateTime(assignment.completedAt),
                },
                {
                  key: 'environments',
                  term: 'Environments',
                  description: (
                    <Link to={`/projects/${assignment.projectId}/environments`}>
                      Where this project is deployed
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      {recording ? (
        <TestResultForm assignment={assignment} onClose={() => setRecording(false)} />
      ) : null}
    </div>
  );
}
