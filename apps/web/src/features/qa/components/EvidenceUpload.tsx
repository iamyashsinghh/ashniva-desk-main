import type { FileSummary } from '@ashniva/types';
import { Alert, Button } from '@ashniva/ui';
import { useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { useFileMutations } from '../../files/api';

interface EvidenceUploadProps {
  /** Where the screenshot or log is attached — the same subject as the assignment. */
  parent: { taskId?: string; ticketId?: string; projectId?: string };
  /** The uploaded file, held by the form so it can send `evidenceFileId` with the result. */
  file: FileSummary | null;
  onChange: (file: FileSummary | null) => void;
}

/**
 * One screenshot or log for a test result.
 *
 * The file is uploaded straight away and the result carries its id, because the alternative —
 * holding bytes until the form is submitted — loses the evidence whenever the submit is refused.
 * It is uploaded as an internal file: a failing screenshot is not a client-facing document.
 */
export function EvidenceUpload({ parent, file, onChange }: EvidenceUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | undefined>();
  const { upload } = useFileMutations();

  async function handle(chosen: File | undefined) {
    if (!chosen) {
      return;
    }
    setError(undefined);
    try {
      onChange(await upload.mutateAsync({ file: chosen, ...parent, visibility: 'INTERNAL' }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div className="qa-evidence">
      {file ? (
        <p className="qa-evidence__file">
          {file.name}{' '}
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Remove
          </Button>
        </p>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        aria-label="Evidence file"
        disabled={upload.isPending}
        onChange={(event) => void handle(event.target.files?.[0])}
      />
      {upload.isPending ? <p className="muted">Uploading…</p> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
