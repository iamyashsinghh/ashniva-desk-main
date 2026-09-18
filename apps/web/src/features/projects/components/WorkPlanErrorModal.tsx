import { VISIBILITY } from '@ashniva/types';
import { Button, FormField, Modal, Textarea } from '@ashniva/ui';
import { useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { uploadFile } from '../../files/api';

export function WorkPlanErrorModal({
  projectId,
  busy,
  onClose,
  onSubmit,
}: {
  projectId: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: string, fileId?: string) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pending = busy || sending;

  async function send() {
    const text = body.trim();
    if (!text) {
      return;
    }
    setSending(true);
    setError(undefined);
    try {
      let fileId: string | undefined;
      if (file) {
        const uploaded = await uploadFile({
          file,
          projectId,
          visibility: VISIBILITY.INTERNAL,
        });
        fileId = uploaded.id;
      }
      await onSubmit(text, fileId);
      onClose();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      size="sm"
      title="Report error"
      description="The developer sees this on the task comments. Their leftover time stays paused until they resume."
      onClose={pending ? () => undefined : onClose}
      footer={
        <>
          <Button size="sm" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={pending}
            disabled={!body.trim()}
            disabledReason="Write what is wrong"
            onClick={() => void send()}
          >
            Send error
          </Button>
        </>
      }
    >
      <FormField
        label="What is wrong?"
        hint="Required. This is posted as an internal task comment."
      >
        <Textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
      </FormField>
      <FormField
        label="Screenshot"
        hint="Optional. PNG, JPEG, GIF or WebP. The developer sees it under the comment."
      >
        <input
          className="work-plan__file"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </FormField>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
