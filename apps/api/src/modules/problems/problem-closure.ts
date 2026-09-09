import { TASK_STATUS, problemClosureGate, type ProblemClosureState } from '@ashniva/types';

import type { ProblemDetailRow } from './problems.repository';

/**
 * Turning a stored problem into the four facts the closure gate judges.
 *
 * The gate itself is a pure function in `@ashniva/types`; this is the only place that decides what
 * each of its facts means in the database, so the screen's disabled button, the API's refusal and
 * the unit tests all read the same rules.
 */

/**
 * An RCA counts as submitted once somebody has actually submitted it.
 *
 * A `DRAFT` is the empty form "Request RCA" creates, and `CHANGES_REQUESTED` is one that was read
 * and sent back — neither is an analysis, and treating either as one would let a problem be closed
 * on a form nobody finished.
 */
function isRcaSubmitted(rca: ProblemDetailRow['rca']): boolean {
  return rca !== null && (rca.status === 'SUBMITTED' || rca.status === 'APPROVED');
}

export function problemClosureFor(row: ProblemDetailRow): ProblemClosureState {
  const decision = problemClosureGate({
    rcaSubmitted: isRcaSubmitted(row.rca),
    fixAssigned: row.fixTaskId !== null,
    // "Verified live" in the approved design is the task reaching Completed: the fix is not out
    // because somebody wrote a commit, it is out because the work that carried it finished.
    fixVerified: row.fixTask?.status === TASK_STATUS.COMPLETED,
    preventiveTestAdded: row.preventiveTest !== null || row.preventiveTestTaskId !== null,
  });
  return {
    allowed: decision.allowed,
    blockers: [...decision.blockers],
    warnings: [...decision.warnings],
  };
}
