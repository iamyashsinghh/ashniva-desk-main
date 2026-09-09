import type { FileSummary, Visibility } from '@ashniva/types';
import { Button, EmptyState, VisibilityBadge } from '@ashniva/ui';
import { useRef, useState } from 'react';

import { errorMessage } from '../../../shared/lib/api-client';
import { formatRelative } from '../../../shared/lib/format';
import { useFileMutations } from '../api';
import { FileLink } from './FileLink';

interface FileListProps {
  files: FileSummary[];
  /** Where a new upload is attached. */
  parent: {
    taskId?: string;
    ticketId?: string;
    projectId?: string;
    contractId?: string;
    milestoneId?: string;
    changeRequestId?: string;
    approvalId?: string;
  };
  canUpload: boolean;
  /** Which files show "Remove"; defaults to every file when uploads are allowed. */
  canRemove?: (file: FileSummary) => boolean;
  /** Internal staff choose; clients always upload client-visible files. */
  chooseVisibility?: boolean;
  /** Called with the new file so callers can collect ids before the parent exists. */
  onUploaded?: (file: FileSummary) => void;
}

/** Attachments with download links, an upload button and an honest size limit. */
export function FileList({
  files,
  parent,
  canUpload,
  canRemove = () => canUpload,
  chooseVisibility = false,
  onUploaded,
}: FileListProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [visibility, setVisibility] = useState<Visibility>('INTERNAL');
  const [error, setError] = useState<string | undefined>();
  const { upload, remove } = useFileMutations();

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setError(undefined);
    try {
      const uploaded = await upload.mutateAsync({
        file,
        ...parent,
        visibility: chooseVisibility ? visibility : undefined,
      });
      onUploaded?.(uploaded);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <div className="file-list">
      {files.length === 0 ? (
        <EmptyState title="No attachments" />
      ) : (
        <ul className="file-list__items">
          {files.map((file) => (
            <li key={file.id} className="file-list__item">
              <FileLink file={file} />
              <span className="muted">
                {Math.max(1, Math.round(file.sizeBytes / 1024))} KB · {file.uploadedBy.name} ·{' '}
                {formatRelative(file.createdAt)}
              </span>
              <VisibilityBadge visibility={file.visibility} />
              {canRemove(file) ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void remove.mutateAsync(file.id).catch((cause) => setError(errorMessage(cause)))
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canUpload ? (
        <div className="file-list__upload">
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            id={`upload-${parent.taskId ?? parent.ticketId ?? parent.projectId ?? 'new'}`}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          {chooseVisibility ? (
            <label className="file-list__visibility">
              <input
                type="checkbox"
                checked={visibility === 'CLIENT'}
                onChange={(event) => setVisibility(event.target.checked ? 'CLIENT' : 'INTERNAL')}
              />
              Client-visible
            </label>
          ) : null}
          <Button size="sm" loading={upload.isPending} onClick={() => inputRef.current?.click()}>
            Upload file
          </Button>
          <span className="muted">PNG, JPG, PDF, text, CSV, Office, ZIP · 10 MB max</span>
          {error ? (
            <span className="inline-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
