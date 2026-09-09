/**
 * What Desk accepts as an attachment.
 *
 * Shared rather than API-only because three places have to agree: `POST /files`, the support
 * ingress, and the phone. The API remains the authority — it checks every upload — but a client
 * that cannot see the rules can only find out by sending the file, which on a phone means the
 * whole of a 9 MB video crossing somebody's cellular data before the 400 comes back. A second
 * copy of the list would drift, and the looser copy is the one that wastes the upload.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Content types accepted for attachments (screenshots, documents, logs, archives). */
export const ALLOWED_FILE_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type AllowedFileContentType = (typeof ALLOWED_FILE_CONTENT_TYPES)[number];

const allowed: ReadonlySet<string> = new Set<string>(ALLOWED_FILE_CONTENT_TYPES);

export function isAllowedContentType(contentType: string): boolean {
  return allowed.has(contentType);
}
