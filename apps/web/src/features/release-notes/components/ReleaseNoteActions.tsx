import { PERMISSIONS, type ReleaseNoteDetail } from '@ashniva/types';
import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { usePermission } from '../../auth/session-context';
import { useReleaseNoteMutations, type ReleaseNoteStep } from '../api';

interface ReleaseNoteActionsProps {
  note: ReleaseNoteDetail;
}

interface StepConfig {
  step: ReleaseNoteStep;
  label: string;
  variant?: 'primary' | 'danger';
  /** Actions the API refuses without a reason ask for one before sending. */
  needsNote?: boolean;
}

/**
 * The workflow buttons.
 *
 * What is shown mirrors what the API allows, so the two do not drift: the same status and the
 * same permission decide both. Hiding a button is presentation only — the API refuses the call
 * regardless.
 */
export function ReleaseNoteActions({ note }: ReleaseNoteActionsProps) {
  const [pending, setPending] = useState<StepConfig | null>(null);
  const canWrite = usePermission(PERMISSIONS.RELEASE_NOTE_WRITE);
  const canApprove = usePermission(PERMISSIONS.RELEASE_NOTE_APPROVE);
  const canPublish = usePermission(PERMISSIONS.RELEASE_NOTE_PUBLISH);
  const { step } = useReleaseNoteMutations(note.id);

  const available: StepConfig[] = [];
  if (canWrite && (note.status === 'DRAFT' || note.status === 'CHANGES_REQUESTED')) {
    available.push({ step: 'submit', label: 'Send for review', variant: 'primary' });
  }
  if (canApprove && note.status === 'IN_REVIEW') {
    available.push({ step: 'approve', label: 'Approve', variant: 'primary' });
    available.push({ step: 'request-changes', label: 'Request changes', needsNote: true });
  }
  if (canPublish && note.status === 'APPROVED') {
    available.push({ step: 'publish', label: 'Publish to client', variant: 'primary' });
  }
  if (
    canWrite &&
    (note.status === 'CHANGES_REQUESTED' ||
      note.status === 'APPROVED' ||
      note.status === 'CANCELLED')
  ) {
    available.push({ step: 'return-to-draft', label: 'Reopen for editing' });
  }
  if (canApprove && note.status !== 'PUBLISHED' && note.status !== 'CANCELLED') {
    available.push({ step: 'cancel', label: 'Cancel', variant: 'danger', needsNote: true });
  }

  if (available.length === 0) {
    return null;
  }

  return (
    <>
      <div className="detail-actions">
        {available.map((config) => (
          <Button
            key={config.step}
            variant={config.variant}
            loading={step.isPending}
            onClick={() =>
              config.needsNote ? setPending(config) : void step.mutateAsync({ step: config.step })
            }
          >
            {config.label}
          </Button>
        ))}
      </div>
      {pending ? (
        <ReasonModal
          config={pending}
          onClose={() => setPending(null)}
          onConfirm={(note_) => step.mutateAsync({ step: pending.step, note: note_ })}
        />
      ) : null}
    </>
  );
}

function ReasonModal({
  config,
  onClose,
  onConfirm,
}: {
  config: StepConfig;
  onClose: () => void;
  onConfirm: (note: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const { error, wrap } = useSubmitHandler(onClose);

  return (
    <Modal
      open
      title={config.label}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant={config.variant}
            disabled={reason.trim().length === 0}
            disabledReason="A reason is required"
            onClick={() => void wrap(() => onConfirm(reason.trim()))()}
          >
            {config.label}
          </Button>
        </>
      }
    >
      <FormField label="Reason" required hint="The next person to pick this up will read it">
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
