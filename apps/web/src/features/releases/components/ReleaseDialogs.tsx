import {
  RELEASE_APPROVAL_DECISION,
  type ReleaseApproverRole,
  type ReleaseDetail,
} from '@ashniva/types';
import {
  Alert,
  Button,
  FormField,
  FormGrid,
  FormGridFull,
  Input,
  Modal,
  Select,
  Textarea,
} from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useReleaseMutations } from '../api';
import { APPROVER_ROLE_LABELS } from '../release-display';
import { ReasonModal } from './ReasonModal';

/** The release actions that have to ask for something before they can be sent. */

/** `datetime-local` gives a local wall-clock string; the API wants an instant. */
function toIso(local: string): string {
  return new Date(local).toISOString();
}

export function ScheduleReleaseModal({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const [at, setAt] = useState('');
  const [note, setNote] = useState('');
  const { schedule } = useReleaseMutations();
  const { error, wrap } = useSubmitHandler(onClose);

  // Read the clock when the operator commits, not while rendering: a component that asks the time
  // on every render gives a different answer each time it happens to re-render.
  const send = async () => {
    if (new Date(at).getTime() <= Date.now()) {
      throw new Error('Schedule a release for a time that has not passed yet');
    }
    await schedule.mutateAsync({ id: release.id, at: toIso(at), note: note.trim() || undefined });
  };

  return (
    <Modal
      open
      title={release.scheduledFor ? 'Move the release window' : 'Plan when this goes out'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={schedule.isPending}
            disabled={at === ''}
            disabledReason="Pick when the release should go out"
            onClick={() => void wrap(send)()}
          >
            Schedule
          </Button>
        </>
      }
    >
      <p className="muted">
        This is a reminder, not a timer: nothing publishes the release when the moment comes.
        Somebody still presses Publish, and every gate is re-checked then.
      </p>
      <FormGrid>
        <FormGridFull>
          <FormField label="When it should go out" required>
            <Input
              type="datetime-local"
              value={at}
              onChange={(event) => setAt(event.target.value)}
            />
          </FormField>
        </FormGridFull>
        <FormGridFull>
          <FormField label="Note" hint="Recorded on the release history">
            <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}

/**
 * One required sign-off, recorded or withheld.
 *
 * A rejection must carry a reason — the API refuses it without one, and a signature withheld
 * silently tells the next person nothing. The role picker only appears when the release is
 * waiting on more than one: it is for the person who wears two hats on a small team.
 */
export function ApprovalDecisionModal({
  release,
  decision,
  onClose,
}: {
  release: ReleaseDetail;
  decision: typeof RELEASE_APPROVAL_DECISION.APPROVED | typeof RELEASE_APPROVAL_DECISION.REJECTED;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [role, setRole] = useState<ReleaseApproverRole | ''>('');
  const { approve } = useReleaseMutations();
  const { error, wrap } = useSubmitHandler(onClose);

  const rejecting = decision === RELEASE_APPROVAL_DECISION.REJECTED;
  const waiting = release.approvals.filter(
    (row) => row.decision === RELEASE_APPROVAL_DECISION.PENDING,
  );
  const blocked = rejecting && note.trim().length === 0;

  return (
    <Modal
      open
      title={rejecting ? 'Reject this release' : 'Approve this release'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={rejecting ? 'danger' : 'primary'}
            loading={approve.isPending}
            disabled={blocked}
            disabledReason="A rejection has to say why"
            onClick={() =>
              void wrap(() =>
                approve.mutateAsync({
                  id: release.id,
                  decision,
                  note: note.trim() || undefined,
                  approverRole: role || undefined,
                }),
              )()
            }
          >
            {rejecting ? 'Reject' : 'Approve'}
          </Button>
        </>
      }
    >
      <p className="muted">
        {rejecting
          ? 'The release goes back to draft and the sign-offs collected so far are discarded.'
          : `You are signing off ${release.version} — ${release.title}.`}
      </p>
      <FormGrid>
        {waiting.length > 1 ? (
          <FormGridFull>
            <FormField
              label="Which sign-off is this?"
              hint="Leave it as it is unless you hold more than one of these roles"
            >
              <Select
                value={role}
                onChange={(event) => setRole(event.target.value as ReleaseApproverRole | '')}
                options={[
                  { value: '', label: 'The one my role implies' },
                  ...waiting.map((row) => ({
                    value: row.approverRole,
                    label: APPROVER_ROLE_LABELS[row.approverRole],
                  })),
                ]}
              />
            </FormField>
          </FormGridFull>
        ) : null}
        <FormGridFull>
          <FormField
            label={rejecting ? 'Why' : 'Note'}
            required={rejecting}
            hint="Everyone on this release reads it"
          >
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </FormField>
        </FormGridFull>
      </FormGrid>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}

/**
 * Sending a failed release back to draft.
 *
 * Every signature the release collected is discarded by the move, so the reason is required for
 * the same purpose a rejection's is: the approvers who are about to be asked again get to read
 * what changed underneath them.
 */
export function ReopenReleaseModal({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const { reopen } = useReleaseMutations();
  return (
    <ReasonModal
      title={`Reopen ${release.version}`}
      consequence="This goes back to draft and every sign-off collected so far is discarded — what the approvers looked at is about to change."
      label="Why it is going back"
      hint="The approvers you ask again will read this"
      confirmLabel="Reopen"
      confirmVariant="primary"
      missingReason="Say what went wrong and what happens next"
      pending={reopen.isPending}
      onConfirm={(reason) => reopen.mutateAsync({ id: release.id, reason })}
      onClose={onClose}
    />
  );
}

/** Pulling a release. The reason is required: an unexplained rollback teaches nobody. */
export function RollbackReleaseModal({
  release,
  onClose,
}: {
  release: ReleaseDetail;
  onClose: () => void;
}) {
  const { rollback } = useReleaseMutations();
  return (
    <ReasonModal
      title={`Roll back ${release.version}`}
      consequence="A version that was pulled is history: shipping it again is a new release with a new version."
      label="Why it was pulled"
      hint="Kept on the release and in the audit log"
      confirmLabel="Roll back"
      confirmVariant="danger"
      missingReason="Say why it was pulled"
      pending={rollback.isPending}
      onConfirm={(reason) => rollback.mutateAsync({ id: release.id, reason })}
      onClose={onClose}
    />
  );
}
