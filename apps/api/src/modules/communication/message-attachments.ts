import type { FileSummary, Visibility } from '@ashniva/types';

import type { MessageRow } from './conversations.repository';

type MessageAttachmentRow = MessageRow['attachments'][number];

/**
 * At least one named file was not this sender's to attach.
 *
 * Adoption is a filtered `updateMany` — the sender's own file, in their organization, not already
 * owned by a task, a ticket, a comment or another message, not deleted — and until now the count
 * it returned was discarded. So a file that did not match was dropped in silence: the message
 * posted, the attachment did not, and nobody was told. While a body was mandatory the worst of
 * that was "your file did not go"; once a message could *be* a file, the same drop wrote a
 * message with neither words nor attachments — the exact thing `MessagesService.send` refuses in
 * the request one screen earlier.
 *
 * Thrown from inside the write transaction, so the message is rolled back with the adoption rather
 * than left behind for a caller to clean up. It is not an HTTP concern and does not know it will
 * become a 400; `MessagesService` decides that, because that is where the refusal is worded.
 */
export class UnadoptableAttachmentsError extends Error {
  constructor(
    readonly requested: number,
    readonly adopted: number,
  ) {
    super(`${adopted} of ${requested} attachments could be adopted`);
    this.name = 'UnadoptableAttachmentsError';
  }
}

/**
 * A message attachment, as the thread shows it.
 *
 * The same shape the files module returns everywhere else, mapped here because this query selects
 * a narrower row than that module's own. It is emphatically *not* a second upload path: the bytes
 * arrived through `POST /files`, with that module's content-type rules, size limit, storage key
 * and tenancy, and this only decides how the row is rendered.
 *
 * Visibility is forced to INTERNAL when a file is attached to a message, so an attachment cannot
 * become client-visible by having been uploaded as something else first.
 */
export function toMessageFileSummary(row: MessageAttachmentRow): FileSummary {
  return {
    id: row.id,
    name: row.name,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    visibility: row.visibility as Visibility,
    caption: row.caption,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
  };
}
