import type { FileSummary, Visibility } from '@ashniva/types';

import { apiRequest } from '../../shared/api/client';
import {
  AttachmentTooLargeError,
  AttachmentTypeError,
  isAllowedType,
  isTooLarge,
  type PickedFile,
} from '../../shared/attachments/attachments';

/** What a commercial file hangs off: a contract's documents, or a change request's files. */
export type CommercialFileParent = { contractId: string } | { changeRequestId: string };

/**
 * Attaching a file to a contract or a change request.
 *
 * `POST /files` takes these parents, but the shared `AttachmentTarget` names only tasks, tickets
 * and projects — so this is the same upload, with the same on-device size and type checks from the
 * shared module, and the parent field it lacks. Visibility is always sent: a contract document is
 * often the signed copy the client should see, and a file the team wanted private must not reach
 * the portal because a default was assumed.
 */
export async function uploadCommercialFile(
  file: PickedFile,
  parent: CommercialFileParent,
  visibility: Visibility,
): Promise<FileSummary> {
  if (isTooLarge(file)) {
    throw new AttachmentTooLargeError();
  }
  if (!isAllowedType(file)) {
    throw new AttachmentTypeError(file.type);
  }
  const form = new FormData();
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  if ('contractId' in parent) {
    form.append('contractId', parent.contractId);
  } else {
    form.append('changeRequestId', parent.changeRequestId);
  }
  form.append('visibility', visibility);
  return apiRequest<FileSummary>('/files', { method: 'POST', body: form });
}
