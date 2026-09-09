import {
  EMERGENCY_FIX_STATUS,
  EMERGENCY_FIX_STATUS_LABELS,
  PERMISSIONS,
  canDecideEmergencyFix,
  canRequestEmergencyFix,
  type IncidentDetail,
} from '@ashniva/types';
import { Button, Card, StatusPill } from '@ashniva/ui';
import { useState } from 'react';

import { ReasonModal } from '../../../shared/components/ReasonModal';
import { formatDateTime } from '../../../shared/lib/format';
import { usePermission } from '../../auth/session-context';
import { useIncidentMutations } from '../incident-api';
import { EMERGENCY_FIX_TONE } from '../problem-display';

import '../problems.css';

type Dialog = 'request' | 'approve' | 'reject' | null;

/**
 * Shipping outside the release process.
 *
 * Asking is one action and deciding is another, and they are deliberately different permissions:
 * the person under pressure at two in the morning is not the person who authorises skipping the
 * release. The consequence is stated on the sheet itself rather than left to be remembered, and a
 * reason is required for either answer — an approval nobody explained is the record a later
 * review cannot use.
 */
export function EmergencyFixPanel({ incident }: { incident: IncidentDetail }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const canManage = usePermission(PERMISSIONS.INCIDENT_MANAGE);
  const canApprove = usePermission(PERMISSIONS.INCIDENT_APPROVE_EMERGENCY_FIX);
  const { requestEmergencyFix, decideEmergencyFix } = useIncidentMutations();

  const status = incident.emergencyFixStatus;

  return (
    <Card
      title="Emergency fix"
      headerAddon={
        <StatusPill tone={EMERGENCY_FIX_TONE[status]} label={EMERGENCY_FIX_STATUS_LABELS[status]} />
      }
    >
      {incident.emergencyFixReason ? (
        <p className="prose">{incident.emergencyFixReason}</p>
      ) : (
        <p className="muted">
          Skipping the scheduled release needs somebody senior to say so in writing.
        </p>
      )}

      {incident.emergencyFixDecidedAt ? (
        <p className="muted">
          Decided by {incident.emergencyFixDecidedBy?.name ?? 'somebody'} on{' '}
          {formatDateTime(incident.emergencyFixDecidedAt)}
        </p>
      ) : null}

      <div className="problem-actions">
        {canRequestEmergencyFix(status) ? (
          <Button
            variant="danger"
            disabled={!canManage}
            disabledReason="Asking for an emergency fix needs the incident:manage permission"
            onClick={() => setDialog('request')}
          >
            Request emergency fix
          </Button>
        ) : null}

        {canDecideEmergencyFix(status) ? (
          <>
            <Button
              variant="primary"
              disabled={!canApprove}
              disabledReason="Approving needs the incident:approve-emergency-fix permission"
              onClick={() => setDialog('approve')}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              disabled={!canApprove}
              disabledReason="Deciding needs the incident:approve-emergency-fix permission"
              onClick={() => setDialog('reject')}
            >
              Refuse
            </Button>
          </>
        ) : null}

        {status === EMERGENCY_FIX_STATUS.REJECTED ? (
          <p className="problem-actions__warning">
            A refusal is a decision. If the situation has genuinely changed, open a new incident.
          </p>
        ) : null}
        {status === EMERGENCY_FIX_STATUS.APPROVED ? (
          <p className="problem-actions__warning">
            Skips the scheduled release; still requires a QA smoke on production afterwards.
          </p>
        ) : null}
      </div>

      <ReasonModal
        open={dialog === 'request'}
        title="Request an emergency fix"
        label="Why this cannot wait for the scheduled release"
        submitLabel="Request"
        variant="danger"
        busy={requestEmergencyFix.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => requestEmergencyFix.mutateAsync({ id: incident.id, reason })}
      />

      <ReasonModal
        open={dialog === 'approve'}
        title="Approve the emergency fix"
        label="Why, in words. This skips the scheduled release and still owes a production smoke test."
        submitLabel="Approve"
        busy={decideEmergencyFix.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(reason) =>
          decideEmergencyFix.mutateAsync({ id: incident.id, decision: 'APPROVED', reason })
        }
      />

      <ReasonModal
        open={dialog === 'reject'}
        title="Refuse the emergency fix"
        label="Why. The person who asked is owed the reason."
        submitLabel="Refuse"
        variant="danger"
        busy={decideEmergencyFix.isPending}
        onClose={() => setDialog(null)}
        onSubmit={(reason) =>
          decideEmergencyFix.mutateAsync({ id: incident.id, decision: 'REJECTED', reason })
        }
      />
    </Card>
  );
}
