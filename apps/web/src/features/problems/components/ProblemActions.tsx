import { PERMISSIONS, PROBLEM_STATUS, type ProblemDetail } from '@ashniva/types';
import { Alert, Button } from '@ashniva/ui';
import { useState } from 'react';

import { ReasonModal } from '../../../shared/components/ReasonModal';
import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useProblemMutations } from '../api';
import { AssignFixModal } from './AssignFixModal';
import { closeBlockedReason } from '../problem-display';

import '../problems.css';

type Dialog = 'request-rca' | 'assign-fix' | 'preventive-test' | 'ask' | null;

/**
 * The action row on a problem.
 *
 * Whether **Close problem** works is not decided here at all. `closure.allowed` decides, and when
 * it is false the server's own blocker sentences are what the button says and what is printed
 * underneath it — so the disabled button and the refusal that would come back cannot drift apart.
 * The rest follows status and permission, which are the same two things the API checks.
 */
export function ProblemActions({ problem }: { problem: ProblemDetail }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const canManage = usePermission(PERMISSIONS.PROBLEM_MANAGE);
  const canPreventive = usePermission(PERMISSIONS.PROBLEM_ADD_PREVENTIVE_TEST);
  const canRead = usePermission(PERMISSIONS.PROBLEM_READ);
  const { requestRca, preventiveTest, askDeveloper, close } = useProblemMutations();

  const open = problem.status !== PROBLEM_STATUS.CLOSED;
  const blocked = closeBlockedReason(problem.closure);
  const warning = problem.closure.warnings.join(' ');

  const closeProblem = async () => {
    setError(null);
    try {
      await close.mutateAsync({ id: problem.id });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <>
      <div className="problem-actions">
        {canManage && open && problem.status === PROBLEM_STATUS.OPEN ? (
          <Button variant="primary" onClick={() => setDialog('request-rca')}>
            Request RCA
          </Button>
        ) : null}

        {canRead && open ? <Button onClick={() => setDialog('ask')}>Ask developer</Button> : null}

        {canManage && open ? (
          <Button onClick={() => setDialog('assign-fix')}>Assign permanent fix</Button>
        ) : null}

        {open ? (
          <Button
            disabled={!canPreventive}
            disabledReason="Recording a preventive test needs the problem:add-preventive-test permission"
            onClick={() => setDialog('preventive-test')}
          >
            Add preventive test
          </Button>
        ) : null}

        {open ? (
          <Button
            variant="danger"
            loading={close.isPending}
            disabled={!canManage || Boolean(blocked)}
            disabledReason={
              canManage ? blocked : 'Closing a problem needs the problem:manage permission'
            }
            onClick={() => void closeProblem()}
          >
            Close problem
          </Button>
        ) : null}

        {/* The server's own sentence, printed where the approved design prints it. */}
        {open && blocked ? <p className="problem-actions__blocker">{blocked}</p> : null}
        {open && !blocked && warning ? <p className="problem-actions__warning">{warning}</p> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>

      <ReasonModal
        open={dialog === 'request-rca'}
        title="Request a root-cause analysis"
        label="When is it due? (YYYY-MM-DD, optional)"
        submitLabel="Request RCA"
        required={false}
        placeholder="2026-10-01"
        busy={requestRca.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(dueDate) =>
          requestRca.mutateAsync({ id: problem.id, dueDate: dueDate || undefined })
        }
      />

      {dialog === 'assign-fix' ? (
        <AssignFixModal problem={problem} onClose={() => setDialog(null)} />
      ) : null}

      <ReasonModal
        open={dialog === 'preventive-test'}
        title="Add a preventive test"
        label="The test that stops this coming back"
        submitLabel="Record it"
        busy={preventiveTest.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(text) => preventiveTest.mutateAsync({ id: problem.id, preventiveTest: text })}
      />

      <ReasonModal
        open={dialog === 'ask'}
        title="Ask the developer"
        label="Your question"
        submitLabel="Ask"
        busy={askDeveloper.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(body) => askDeveloper.mutateAsync({ id: problem.id, body })}
      />
    </>
  );
}
