import { LIMITS, type IssueInput, type SupportAttachment } from './contract';

/**
 * Client-side validation, mirroring the server's bounds exactly.
 *
 * **Not a security control.** The server validates everything again and is the only thing that
 * decides. What this buys is the difference between a reporter seeing "a description is at most
 * 10,000 characters" while they are typing and seeing a 400 after waiting for a ten-megabyte
 * upload to finish. The bounds live in `contract.ts` next to the note about how they are kept in
 * step with `support-ingress.dto.ts`.
 */

export class SupportValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'SupportValidationError';
  }
}

/** Every problem with an issue, in the order a form would show them. Empty means it will be sent. */
export function validateIssue(input: IssueInput): SupportValidationError[] {
  const problems: SupportValidationError[] = [];
  const subject = input.subject?.trim() ?? '';
  const description = input.description?.trim() ?? '';

  if (subject.length < LIMITS.titleMin || subject.length > LIMITS.titleMax) {
    problems.push(
      new SupportValidationError(
        'subject',
        `A subject is between ${LIMITS.titleMin} and ${LIMITS.titleMax} characters`,
      ),
    );
  }
  if (description.length < LIMITS.descriptionMin || description.length > LIMITS.descriptionMax) {
    problems.push(
      new SupportValidationError(
        'description',
        `A description is between ${LIMITS.descriptionMin} and ${LIMITS.descriptionMax.toLocaleString('en')} characters`,
      ),
    );
  }
  if (input.context && input.context.length > LIMITS.contextMax) {
    problems.push(
      new SupportValidationError('context', `Context is at most ${LIMITS.contextMax} characters`),
    );
  }
  if (input.externalReference && input.externalReference.length > LIMITS.externalReferenceMax) {
    problems.push(
      new SupportValidationError(
        'externalReference',
        `A reference is at most ${LIMITS.externalReferenceMax} characters`,
      ),
    );
  }
  problems.push(...validateMetadata(input.metadata));
  problems.push(...validateAttachments(input.attachments));
  return problems;
}

function validateMetadata(metadata: Record<string, string> | undefined): SupportValidationError[] {
  if (!metadata) {
    return [];
  }
  const entries = Object.entries(metadata);
  if (entries.length > LIMITS.metadataKeys) {
    return [
      new SupportValidationError(
        'metadata',
        `Metadata carries at most ${LIMITS.metadataKeys} entries`,
      ),
    ];
  }
  const problems: SupportValidationError[] = [];
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > LIMITS.metadataKeyMax) {
      problems.push(
        new SupportValidationError(
          `metadata.${key}`,
          `A metadata key is 1 to ${LIMITS.metadataKeyMax} characters`,
        ),
      );
    }
    if (typeof value !== 'string' || value.length > LIMITS.metadataValueMax) {
      problems.push(
        new SupportValidationError(
          `metadata.${key}`,
          `A metadata value is text of at most ${LIMITS.metadataValueMax} characters`,
        ),
      );
    }
  }
  return problems;
}

function validateAttachments(
  attachments: SupportAttachment[] | undefined,
): SupportValidationError[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }
  if (attachments.length > LIMITS.attachmentsMax) {
    return [
      new SupportValidationError(
        'attachments',
        `At most ${LIMITS.attachmentsMax} files may be attached`,
      ),
    ];
  }
  const problems: SupportValidationError[] = [];
  attachments.forEach((attachment, index) => {
    if (!attachment.filename || attachment.filename.length > LIMITS.filenameMax) {
      problems.push(
        new SupportValidationError(
          `attachments.${index}.filename`,
          `A file name is 1 to ${LIMITS.filenameMax} characters`,
        ),
      );
    }
    if (!attachment.contentType || attachment.contentType.length > LIMITS.contentTypeMax) {
      problems.push(
        new SupportValidationError(`attachments.${index}.contentType`, 'A file type is required'),
      );
    }
    const bytes = decodedByteLength(attachment.content);
    if (bytes === 0) {
      problems.push(
        new SupportValidationError(
          `attachments.${index}.content`,
          'That file is empty or is not valid base64',
        ),
      );
    } else if (bytes > LIMITS.attachmentBytesMax) {
      problems.push(
        new SupportValidationError(`attachments.${index}.content`, 'Files are limited to 10 MB'),
      );
    }
  });
  return problems;
}

/**
 * How many bytes a base64 string decodes to, without decoding it.
 *
 * The server checks the *decoded* size, so checking the string's length here would refuse a file
 * a third smaller than the real limit — and would let one through that is a third too big if the
 * comparison went the other way. Four base64 characters carry three bytes; the padding says how
 * many of the last three are real.
 */
export function decodedByteLength(base64: string): number {
  const clean = base64.replace(/[\n\r\s]/g, '');
  if (clean.length === 0 || clean.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(clean)) {
    return 0;
  }
  let padding = 0;
  if (clean.endsWith('==')) {
    padding = 2;
  } else if (clean.endsWith('=')) {
    padding = 1;
  }
  return (clean.length / 4) * 3 - padding;
}
