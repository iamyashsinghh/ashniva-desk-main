import { PERMISSIONS, type TestingAssignmentDetail } from '@ashniva/types';
import { Alert, Button, Card } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useQaMutations } from '../api';

/**
 * Live verification (design map 2u).
 *
 * After a release goes out somebody has to open production and look. The checklist is the short
 * version of what "look" means, and it is deliberately local to this screen: it guards the button,
 * it is not a record. The record is the assignment moving to Passed, which only
 * `POST /qa/assignments/:id/verify-live` can do — a live verification cannot be passed by the
 * ordinary pass control, and `qa:verify-live` is what gates it.
 */
const CHECKS = [
  'The change is actually live in production',
  'The main flow around it still works end to end',
  'No new errors or alerts since the deploy',
  'Client data looks right — nothing lost or duplicated',
  'You know how to roll back if it turns out badly',
];

interface LiveVerificationChecklistProps {
  assignment: TestingAssignmentDetail;
  /** Opens the ordinary pass/fail form, which is how a live failure is reported. */
  onReportFailure: () => void;
}

export function LiveVerificationChecklist({
  assignment,
  onReportFailure,
}: LiveVerificationChecklistProps) {
  const canVerify = usePermission(PERMISSIONS.QA_VERIFY_LIVE);
  const { verifyLive } = useQaMutations();
  const [ticked, setTicked] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();

  const remaining = CHECKS.length - ticked.length;

  async function verify() {
    setError(undefined);
    try {
      await verifyLive.mutateAsync(assignment.id);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <Card title="Live verification">
      <ul className="qa-checklist">
        {CHECKS.map((check) => (
          <li key={check}>
            <label className="qa-checklist__item">
              <input
                type="checkbox"
                checked={ticked.includes(check)}
                onChange={(event) =>
                  setTicked((current) =>
                    event.target.checked
                      ? [...current, check]
                      : current.filter((item) => item !== check),
                  )
                }
              />
              <span>{check}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="qa-card__actions">
        <Button
          variant="primary"
          loading={verifyLive.isPending}
          disabled={!canVerify || remaining > 0}
          disabledReason={
            canVerify
              ? `${remaining} check${remaining === 1 ? '' : 's'} still to confirm`
              : 'Signing off production needs the qa:verify-live permission'
          }
          onClick={() => void verify()}
        >
          Verify live
        </Button>
        <Button variant="danger" onClick={onReportFailure}>
          Something is wrong live
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Card>
  );
}
