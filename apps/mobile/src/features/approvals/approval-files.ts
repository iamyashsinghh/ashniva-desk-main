import type { FileSummary, Visibility } from '@ashniva/types';

import { apiRequest } from '../../shared/api/client';
import {
  AttachmentTooLargeError,
  AttachmentTypeError,
  isAllowedType,
  isTooLarge,
  type PickedFile,
} from '../../shared/attachments/attachments';

/**
 * Attaching a file to an approval request.
 *
 * `POST /files` takes an `approvalId` parent as well as the task, ticket and project ones, but the
 * shared `AttachmentTarget` names only those three — so this is the same upload, with the same
 * on-device size and type checks imported from the shared module, and the one extra field. The
 * visibility is the caller's choice and is always sent: a file on an approval is often exactly
 * the document the client is being asked to sign off, and that choice is taken, not defaulted.
 */
export async function uploadApprovalFile(
  file: PickedFile,
  approvalId: string,
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
  form.append('approvalId', approvalId);
  form.append('visibility', visibility);
  return apiRequest<FileSummary>('/files', { method: 'POST', body: form });
}
