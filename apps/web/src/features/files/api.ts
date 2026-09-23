import type { FileSummary, Visibility } from '@ashniva/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { apiBlob, apiRequest } from '../../shared/lib/api-client';

export interface UploadFileInput {
  file: File;
  taskId?: string;
  ticketId?: string;
  projectId?: string;
  contractId?: string;
  milestoneId?: string;
  changeRequestId?: string;
  approvalId?: string;
  visibility?: Visibility;
  caption?: string;
}

const PARENT_FIELDS = [
  'taskId',
  'ticketId',
  'projectId',
  'contractId',
  'milestoneId',
  'changeRequestId',
  'approvalId',
] as const;

export function uploadFile(input: UploadFileInput): Promise<FileSummary> {
  const formData = new FormData();
  formData.append('file', input.file);
  for (const field of PARENT_FIELDS) {
    const value = input[field];
    if (value) {
      formData.append(field, value);
    }
  }
  if (input.visibility) formData.append('visibility', input.visibility);
  if (input.caption?.trim()) formData.append('caption', input.caption.trim());
  return apiRequest<FileSummary>('/files', { method: 'POST', formData });
}

/** Fetches the file with the bearer token and hands it to the browser as a download. */
export async function downloadFile(file: Pick<FileSummary, 'id' | 'name'>): Promise<void> {
  const blob = await apiBlob(`/files/${file.id}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * A stored file as something `<img src>` can point at, or null.
 *
 * Files are served behind the bearer token, so an `<img>` pointed straight at `/files/:id/download`
 * fetches without credentials and gets a 401. The bytes are therefore fetched the way every other
 * request is and handed to the browser as an object URL, which is revoked when the component goes
 * away or the id changes — an object URL that is never revoked is a leak that grows with every
 * conversation somebody opens.
 *
 * A failure resolves to null rather than throwing: a missing picture is a missing picture, not an
 * error dialog over a group somebody is trying to read.
 */
export function useFileObjectUrl(fileId: string | null | undefined): string | null {
  // The id is held beside the url so a change of file reads as "no picture yet" on the render
  // that follows it, without the effect having to clear the state first. Resetting state from
  // inside an effect is a cascading render, and here it would also flash the previous group's
  // picture into the next one for a frame.
  const [loaded, setLoaded] = useState<{ fileId: string; url: string } | null>(null);

  useEffect(() => {
    if (!fileId) {
      return undefined;
    }
    let objectUrl: string | undefined;
    let cancelled = false;
    void apiBlob(`/files/${fileId}/download`)
      .then((blob) => {
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ fileId, url: objectUrl });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId]);

  return loaded && loaded.fileId === fileId ? loaded.url : null;
}

export function useFileMutations() {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    await queryClient.invalidateQueries({ queryKey: ['portal'] });
    await queryClient.invalidateQueries({ queryKey: ['contracts'] });
    await queryClient.invalidateQueries({ queryKey: ['milestones'] });
    await queryClient.invalidateQueries({ queryKey: ['change-requests'] });
    await queryClient.invalidateQueries({ queryKey: ['approvals'] });
  };
  return {
    upload: useMutation({ mutationFn: uploadFile, onSuccess: invalidate }),
    remove: useMutation({
      mutationFn: (id: string) => apiRequest<void>(`/files/${id}`, { method: 'DELETE' }),
      onSuccess: invalidate,
    }),
  };
}
