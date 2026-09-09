import {
  RELEASE_APPROVAL_DECISION,
  type ReleaseApprovalRow,
  type ReleaseDetail,
} from '@ashniva/types';
import { Badge, Card } from '@ashniva/ui';
import type { Tone } from '@ashniva/ui';

import { formatDateTime } from '../../../shared/lib/format';
import { useReleasePolicyQuery } from '../api';
import { APPROVER_ROLE_LABELS, isDraft } from '../release-display';

const DECISION: Record<ReleaseApprovalRow['decision'], { label: string; tone: Tone }> = {
  PENDING: { label: 'Waiting', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

/**
 * The sign-offs this release is actually waiting on.
 *
 * These rows are a snapshot: they were written from the project's policy at the moment approval
 * was requested, and changing the policy afterwards neither adds a signature to a release in
 * flight nor removes one that has been given. The card says so, because "the project requires a
 * QA lead" and "this release is waiting on a QA lead" are different statements and only the
 * second one is on screen.
 */
export function ApprovalsList({ release }: { release: ReleaseDetail }) {
  const pending = release.approvals.length === 0;
  // Only worth asking before the snapshot exists: it is the one moment the policy is the answer.
  const policy = useReleasePolicyQuery(release.projectId, pending);

  return (
    <Card
      title="Sign-offs"
      headerAddon={
        pending ? null : <span className="muted">Fixed when approval was requested</span>
      }
    >
      {pending ? (
        <>
          <p className="muted">
            No sign-offs have been recorded. They are fixed onto the release when approval is
            requested.
          </p>
          {policy.data ? (
            <p className="muted">
              {policy.data.approverRoles.length === 0
                ? 'This project requires no sign-off.'
                : `This project currently asks for: ${policy.data.approverRoles
                    .map((role) => APPROVER_ROLE_LABELS[role])
                    .join(', ')}.`}
            </p>
          ) : null}
        </>
      ) : (
        <ul className="release-approvals">
          {release.approvals.map((approval) => (
            <li key={approval.id}>
              <div className="release-approvals__row">
                <strong>{APPROVER_ROLE_LABELS[approval.approverRole]}</strong>
                <Badge tone={DECISION[approval.decision].tone}>
                  {DECISION[approval.decision].label}
                </Badge>
              </div>
              <span className="muted">
                {approval.decision === RELEASE_APPROVAL_DECISION.PENDING
                  ? 'Not decided yet'
                  : `${approval.approverName ?? 'Someone'} · ${formatDateTime(approval.decidedAt)}`}
              </span>
              {approval.note ? <p>{approval.note}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {isDraft(release.status) && !pending ? (
        <p className="muted">These will be collected again when approval is next requested.</p>
      ) : null}
    </Card>
  );
}
