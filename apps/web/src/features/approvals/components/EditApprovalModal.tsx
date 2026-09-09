import type { ApprovalDetail } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useApprovalMutations } from '../api';

/** Edit the wording a client will read, before the request is published. */
export function EditApprovalModal({
  approval,
  onClose,
}: {
  approval: ApprovalDetail;
  onClose: () => void;
}) {
  const { update } = useApprovalMutations(approval.id);
  const { error, wrap } = useSubmitHandler(onClose);
  const [form, setForm] = useState({
    title: approval.title,
    summary: approval.summary,
    dueDate: approval.dueDate ?? '',
    internalNotes: approval.internalNotes ?? '',
  });
  return (
    <Modal
      open
      title="Edit approval request"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={update.isPending}
            onClick={() =>
              void wrap(() =>
                update.mutateAsync({
                  title: form.title.trim(),
                  summary: form.summary.trim(),
                  dueDate: form.dueDate || null,
                  internalNotes: form.internalNotes.trim() || null,
                }),
              )()
            }
          >
            Save
          </Button>
        </>
      }
    >
      <FormField label="Title" required>
        <Input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </FormField>
      <FormField label="Summary for the client" required>
        <Textarea
          rows={4}
          value={form.summary}
          onChange={(event) => setForm({ ...form, summary: event.target.value })}
        />
      </FormField>
      <FormField label="Decision needed by">
        <Input
          type="date"
          value={form.dueDate}
          onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
        />
      </FormField>
      <FormField label="Internal notes">
        <Textarea
          rows={2}
          value={form.internalNotes}
          onChange={(event) => setForm({ ...form, internalNotes: event.target.value })}
        />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
