import {
  PERMISSIONS,
  TESTING_ASSIGNMENT_KIND,
  TESTING_ASSIGNMENT_STATUS,
  type TestingAssignmentDetail,
} from '@ashniva/types';
import { Alert, Button, Card } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useCurrentUser, usePermission } from '../../auth/session-context';
import { useQaMutations } from '../api';
import { ASSIGNMENT_STATUS_LABELS, OPEN_ASSIGNMENT_STATUSES } from '../qa-labels';
import { ClarifyModal } from './ClarifyModal';

interface AssignmentActionsProps {
  assignment: TestingAssignmentDetail;
  /** Opens the pass/fail sheet. */
  onRecordResult: () => void;
  /** A live verification is signed off from its checklist, so the pass control is not shown here. */
  hideRecordResult?: boolean;
}

/**
 * Start testing, ask a question, record a result.
 *
 * Which moves exist is the API's answer (`testing-assignment-workflow.ts`) and every refusal comes
 * back from it word for word. What this decides is only what to draw: a finished assignment gets
 * no controls, and a control that would certainly be refused is disabled with the reason on it
 * rather than left to fail on the round trip.
 */
export function AssignmentActions({
  assignment,
  onRecordResult,
  hideRecordResult = false,
}: AssignmentActionsProps) {
  const me = useCurrentUser();
  const canRecord = usePermission(PERMISSIONS.QA_RECORD_RESULT);
  const { start } = useQaMutations();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (assignment.kind === TESTING_ASSIGNMENT_KIND.UAT) {
    return (
      <Card title="What happens next">
        <p className="muted">
          A client UAT is decided by the client in their portal. Nothing is recorded here.
        </p>
      </Card>
    );
  }

  if (!OPEN_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    return (
      <Card title="What happens next">
        <p className="muted">
          This assignment is {ASSIGNMENT_STATUS_LABELS[assignment.status].toLowerCase()}. A second
          opinion is a new assignment, so nothing here can be edited.
        </p>
      </Card>
    );
  }

  // An unassigned assignment is claimable by anyone who may record results — that is what the
  // "ready for testing" queue is for.
  const mine = assignment.assignedToUserId === null || assignment.assignedToUserId === me.id;
  const blocked = blockedReason(canRecord, mine, assignment.assignedToName);
  const started = assignment.status === TESTING_ASSIGNMENT_STATUS.IN_PROGRESS;

  async function begin() {
    setError(undefined);
    try {
      await start.mutateAsync(assignment.id);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="What happens next">
      <div className="qa-card__actions">
        {started ? null : (
          <Button
            variant="primary"
            loading={start.isPending}
            disabled={Boolean(blocked)}
            disabledReason={blocked}
            onClick={() => void begin()}
          >
            {assignment.status === TESTING_ASSIGNMENT_STATUS.CLARIFICATION
              ? 'Pick it back up'
              : 'Start testing'}
          </Button>
        )}
        {started && !hideRecordResult ? (
          <Button
            variant="primary"
            disabled={Boolean(blocked)}
            disabledReason={blocked}
            onClick={onRecordResult}
          >
            Record pass / fail
          </Button>
        ) : null}
        {started ? (
          <Button
            disabled={Boolean(blocked)}
            disabledReason={blocked}
            onClick={() => setAsking(true)}
          >
            Ask the developer
          </Button>
        ) : null}
      </div>
      {started ? null : (
        <p className="muted">Start testing so the developer can see it is being looked at.</p>
      )}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {asking ? (
        <ClarifyModal assignmentId={assignment.id} onClose={() => setAsking(false)} />
      ) : null}
    </Card>
  );
}

/** Why every control on this card is off, when it is. The server refuses for the same reasons. */
function blockedReason(
  canRecord: boolean,
  mine: boolean,
  assignedToName: string | null,
): string | undefined {
  if (!canRecord) {
    return 'Recording a test result needs the qa:record-result permission';
  }
  if (!mine) {
    return `Only ${assignedToName ?? 'the assigned tester'} can do this`;
  }
  return undefined;
}
