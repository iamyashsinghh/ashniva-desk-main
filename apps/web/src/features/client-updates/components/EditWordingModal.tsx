import type { ClientUpdateSummary } from '@ashniva/types';
import { Alert, Button, FormField, Input, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { useSubmitHandler } from '../../../shared/hooks/use-submit-handler';
import { useClientUpdateMutations } from '../api';

interface EditWordingModalProps {
  update: ClientUpdateSummary;
  onClose: () => void;
}

/** Seniors tidy the client-facing wording before it is published. */
export function EditWordingModal({ update, onClose }: EditWordingModalProps) {
  const [title, setTitle] = useState(update.title);
  const [body, setBody] = useState(update.body);
  const { edit } = useClientUpdateMutations();
  const { error, wrap } = useSubmitHandler(onClose);
  return (
    <Modal
      open
      title="Edit client wording"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={edit.isPending}
            onClick={() =>
              void wrap(() =>
                edit.mutateAsync({ id: update.id, title: title.trim(), body: body.trim() }),
              )()
            }
          >
            Save
          </Button>
        </>
      }
    >
      <FormField label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </FormField>
      <FormField label="Client will read" hint="Plain language, no internal details">
        <Textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
      </FormField>
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </Modal>
  );
}
