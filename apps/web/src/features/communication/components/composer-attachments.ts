import type { FileSummary } from '@ashniva/types';
import { useState, type RefObject } from 'react';

import { uploadFile } from '../../files/api';

/**
 * The files a draft is carrying.
 *
 * Upload first, then send the ids: there is no second upload path here, and the message
 * transaction adopts a file only when nothing else owns it — which is why nothing names a parent
 * on the way up. Naming one would make it somebody else's file and the adoption would refuse it.
 */
export function useComposerAttachments(
  picker: RefObject<HTMLInputElement | null>,
  onError: (cause: unknown) => void,
  /**
   * The sender changed which files the draft carries.
   *
   * Raised here rather than at the two call sites because this hook is what knows the set moved,
   * and both places that move it would otherwise have to remember. The composer decides what it
   * means — releasing the idempotency key, because a message with a different file is a different
   * message. Not raised by `clear`, which runs *after* a send has landed and released the key.
   */
  onChanged: () => void,
) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [uploading, setUploading] = useState(false);

  async function attach(file: File | undefined): Promise<void> {
    if (!file) {
      // The picker was opened and dismissed. Nothing moved, so nothing is announced.
      return;
    }
    // Before the upload rather than after it: the key has to be gone by the time anybody can press
    // Send again, and awaiting first would leave a window where it is not.
    onChanged();
    setUploading(true);
    try {
      const uploaded = await uploadFile({ file });
      setFiles((current) => [...current, uploaded]);
    } catch (cause) {
      onError(cause);
    } finally {
      setUploading(false);
      if (picker.current) {
        picker.current.value = '';
      }
    }
  }

  function remove(id: string): void {
    setFiles((current) => current.filter((file) => file.id !== id));
    onChanged();
  }

  return {
    files,
    uploading,
    attach,
    remove,
    clear: () => setFiles([]),
    open: () => picker.current?.click(),
  };
}
