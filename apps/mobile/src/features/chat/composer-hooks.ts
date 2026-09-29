import type { FileSummary, MessageSummary, SendMessageInput } from '@ashniva/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import {
  pickDocument,
  pickImage,
  takePhoto,
  uploadAttachment,
  UNPARENTED,
  type PickedFile,
} from '../../shared/attachments/attachments';
import { landOwnMessage } from './chat-api';

export interface SendVariables {
  body: string;
  attachmentIds: string[];
  clientMessageId: string;
  replyToId: string | null;
}

/**
 * The send, and what happens the moment the server answers it: the composer clears (`onLanded`)
 * and the answer goes straight into the thread, refreshed behind — see `landOwnMessage`.
 */
export function useSendMessage(conversationId: string, onLanded: () => void) {
  const queryClient = useQueryClient();
  return useApiMutation<SendVariables, MessageSummary>({
    path: `/conversations/${conversationId}/messages`,
    body: (variables): SendMessageInput => ({
      body: variables.body,
      clientMessageId: variables.clientMessageId,
      ...(variables.attachmentIds.length > 0 ? { attachmentIds: variables.attachmentIds } : {}),
      ...(variables.replyToId ? { replyToId: variables.replyToId } : {}),
    }),
    onSuccess: (result) => {
      onLanded();
      landOwnMessage(queryClient, conversationId, result);
    },
  });
}

/**
 * The files attached to the draft.
 *
 * `onChanged` runs whenever the set of files really changes. A different set of files is a
 * different message, exactly as different words are, so the composer drops its send key then.
 */
export function useComposerAttachments(onChanged: () => void) {
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (picker: () => Promise<PickedFile | null>) => {
    setError(null);
    setBusy(true);
    try {
      const file = await picker();
      if (!file) {
        // The picker was opened and dismissed. Nothing changed, so the key stands.
        return;
      }
      // The sharper case: the first send landed carrying nothing, and this is the file it should
      // have carried. Reusing the key would answer with that first message and clear the strip.
      onChanged();
      // No parent: the message adopts the file when it is sent. See `AttachmentTarget`.
      const uploaded = await uploadAttachment(file, UNPARENTED);
      setFiles((current) => [...current, uploaded]);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return {
    files,
    error,
    busy,
    attachPhoto: () => void pick(pickImage),
    attachCamera: () => void pick(takePhoto),
    attachFile: () => void pick(pickDocument),
    remove: (id: string) => {
      setFiles((current) => current.filter((file) => file.id !== id));
      onChanged();
    },
    clear: () => setFiles([]),
  };
}
