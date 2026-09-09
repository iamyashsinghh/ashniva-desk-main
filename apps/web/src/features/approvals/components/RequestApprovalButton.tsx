import type { ApprovalSubjectType } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useApprovalMutations } from '../api';

interface RequestApprovalButtonProps {
  subjectType: ApprovalSubjectType;
  subjectId: string;
  title: string;
  summary?: string;
  label?: string;
}

/** "Request client approval" from a milestone, document, update or change request. */
export function RequestApprovalButton({
  subjectType,
  subjectId,
  title: defaultTitle,
  summary: defaultSummary = '',
  label = 'Request client approval',
}: RequestApprovalButtonProps) {
  const navigate = useNavigate();
  const { create } = useApprovalMutations();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [summary, setSummary] = useState(defaultSummary);
  const [dueDate, setDueDate] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const { error, wrap } = useSubmitHandler(() => setOpen(false));
  const valid = title.trim().length >= 3 && summary.trim().length >= 3;
  const submit = async () => {
    const created = await create.mutateAsync({
      subjectType,
      subjectId,
      title: title.trim(),
      summary: summary.trim(),
      dueDate: dueDate || null,
      internalNotes: internalNotes.trim() || null,
    });
    void navigate(`/approvals/${created.id}`);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        open={open}
        title="Prepare an approval request"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!valid}
              disabledReason="Title and a client-facing summary are required"
              onClick={() => void wrap(submit)()}
            >
              Create draft
            </Button>
          </>
        }
      >
        <p className="actions-card__hint" style={{ marginBottom: 10 }}>
          Starts as a draft. Send it to internal review, then publish it so the client can decide.
        </p>
        <FormField label="Title" required>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </FormField>
        <FormField label="What the client is approving" required hint="Shown to the client">
          <Textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </FormField>
        <FormField label="Decision needed by">
          <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </FormField>
        <FormField label="Internal notes" hint="Never shown to the client">
          <Textarea
            rows={2}
            value={internalNotes}
            onChange={(event) => setInternalNotes(event.target.value)}
          />
        </FormField>
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </Modal>
    </>
  );
}
