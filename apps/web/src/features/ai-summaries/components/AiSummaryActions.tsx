import { PERMISSIONS, isClientFacingSummary, type AiSummaryDetail } from '@ashniva/types';
import { Alert, Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { errorMessage } from '../../../shared/lib/api-client';
import { usePermission } from '../../auth/session-context';
import { useAiSummaryMutations, type AiSummaryStep } from '../api';

/**
 * The review buttons.
 *
 * Which buttons appear follows the same rules the API enforces, so the screen does not offer an
 * action that will be refused. It is not the control, though — the API decides — so a button
 * appearing is never taken as permission by anything.
 */
export function AiSummaryActions({ summary }: { summary: AiSummaryDetail }) {
  const [reasonFor, setReasonFor] = useState<'request-changes' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canGenerate = usePermission(PERMISSIONS.AI_SUMMARY_GENERATE);
  const canApprove = usePermission(PERMISSIONS.AI_SUMMARY_APPROVE);
  const canPublishToClients = usePermission(PERMISSIONS.CLIENT_UPDATE_PUBLISH);
  const { generate, step } = useAiSummaryMutations(summary.id);

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const take = (next: AiSummaryStep) => run(() => step.mutateAsync({ step: next }));

  const editable =
    summary.status === 'DRAFT' ||
    summary.status === 'CHANGES_REQUESTED' ||
    summary.status === 'GENERATION_FAILED';
  const clientFacing = isClientFacingSummary(summary.type);

  return (
    <>
      <div className="detail-actions">
        {editable && canGenerate ? (
          <Button
            loading={generate.isPending}
            onClick={() => void run(() => generate.mutateAsync())}
          >
            {summary.generatedAt ? 'Regenerate' : 'Generate'}
          </Button>
        ) : null}

        {editable && canGenerate ? (
          <Button
            variant="primary"
            loading={step.isPending}
            disabled={!summary.internalContent}
            disabledReason="Generate or write the summary first"
            onClick={() => void take('submit')}
          >
            Send for review
          </Button>
        ) : null}

        {summary.status === 'IN_REVIEW' && canApprove ? (
          <>
            <Button variant="primary" loading={step.isPending} onClick={() => void take('approve')}>
              Approve
            </Button>
            <Button onClick={() => setReasonFor('request-changes')}>Request changes</Button>
          </>
        ) : null}

        {summary.status === 'APPROVED' && clientFacing ? (
          <Button
            variant="primary"
            loading={step.isPending}
            disabled={!canApprove || !canPublishToClients || !summary.clientContent}
            disabledReason={
              summary.clientContent
                ? 'Publishing to a client needs both the approve and the client-publish permission'
                : 'There is no client version to publish'
            }
            onClick={() => void take('publish')}
          >
            Publish to the client
          </Button>
        ) : null}

        {summary.status === 'APPROVED' && canGenerate ? (
          <Button onClick={() => void take('return-to-draft')}>Reopen</Button>
        ) : null}

        {summary.status === 'CANCELLED' && canGenerate ? (
          <Button onClick={() => void take('return-to-draft')}>Reopen</Button>
        ) : null}

        {/*
          GENERATING is excluded as well as the two terminal states: `AI_SUMMARY_ACTIONS.cancel`
          does not list it, so offering the button there produced a 409 every time — and it was
          the only button visible while a summary was generating.
        */}
        {summary.status !== 'PUBLISHED' &&
        summary.status !== 'CANCELLED' &&
        summary.status !== 'GENERATING' &&
        canApprove ? (
          <Button variant="danger" onClick={() => setReasonFor('cancel')}>
            Cancel
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {reasonFor ? (
        <ReasonModal summaryId={summary.id} action={reasonFor} onClose={() => setReasonFor(null)} />
      ) : null}
    </>
  );
}

/** Both actions that need a reason share this, because both refuse an empty one. */
function ReasonModal({
  summaryId,
  action,
  onClose,
}: {
  summaryId: string;
  action: 'request-changes' | 'cancel';
  onClose: () => void;
}) {
  const { step } = useAiSummaryMutations(summaryId);
  const { error, wrap } = useSubmitHandler(onClose);
  const [note, setNote] = useState('');

  return (
    <Modal
      open
      title={action === 'cancel' ? 'Cancel this summary' : 'Send back for changes'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant={action === 'cancel' ? 'danger' : 'primary'}
            loading={step.isPending}
            disabled={note.trim().length < 3}
            disabledReason="Say why, so the next person knows what to change"
            onClick={() => void wrap(() => step.mutateAsync({ step: action, note: note.trim() }))()}
          >
            {action === 'cancel' ? 'Cancel summary' : 'Send back'}
          </Button>
        </>
      }
    >
      <FormField label="Reason" required>
        <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
