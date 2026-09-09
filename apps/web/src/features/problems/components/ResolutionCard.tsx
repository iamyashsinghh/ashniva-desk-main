import { TASK_STATUS_LABELS, type ProblemDetail, type TaskStatus } from '@ashniva/types';
import { Badge, Card } from '@ashniva/ui';
import { Link } from 'react-router';

import { formatDate } from '../../../shared/lib/format';

import '../problems.css';

/**
 * What is being done about this problem, in the three rows the approved design shows.
 *
 * The permanent fix reads its status from the task rather than from anything stored here — the
 * fix is out because the work carrying it finished, not because somebody ticked a box — which is
 * also exactly what the closure gate reads.
 */
export function ResolutionCard({ problem }: { problem: ProblemDetail }) {
  return (
    <Card title="Resolution">
      <div className="problem-resolution">
        <div className="problem-resolution__row">
          <strong>Permanent fix</strong>
          <span>
            {problem.fixTask ? (
              <>
                <Link to={`/tasks/${problem.fixTask.id}`}>{problem.fixTask.key}</Link>{' '}
                {problem.fixTask.title}{' '}
                <Badge tone="neutral">
                  {TASK_STATUS_LABELS[problem.fixTask.status as TaskStatus]}
                </Badge>
              </>
            ) : (
              <span className="muted">Not assigned yet</span>
            )}
          </span>
        </div>

        <div className="problem-resolution__row">
          <strong>Preventive test</strong>
          <span>
            {problem.preventiveTest ?? null}
            {problem.preventiveTestTask ? (
              <>
                {problem.preventiveTest ? ' · ' : ''}
                <Link to={`/tasks/${problem.preventiveTestTask.id}`}>
                  {problem.preventiveTestTask.key}
                </Link>
              </>
            ) : null}
            {!problem.preventiveTest && !problem.preventiveTestTask ? (
              <span className="muted">None recorded — reported at closure, but not a blocker</span>
            ) : null}
          </span>
        </div>

        <div className="problem-resolution__row">
          <strong>RCA due</strong>
          <span>
            {problem.rcaDueDate ? (
              formatDate(problem.rcaDueDate)
            ) : (
              <span className="muted">No date set</span>
            )}
          </span>
        </div>
      </div>
    </Card>
  );
}
