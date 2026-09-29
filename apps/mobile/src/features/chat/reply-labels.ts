import type { FileSummary, MessageReplyRef } from '@ashniva/types';

import type { IconName } from '../../shared/components/Icon';
import { spokenBody } from './message-labels';

export interface AttachmentHint {
  icon: IconName;
  label: string;
}

/**
 * What a quote says about the files a message carried.
 *
 * With the files in hand a picture is called a photo, as phone chats do. A quote from the server
 * only carries how many there were, so it says that and no more rather than guess at a kind.
 */
export function attachmentHint(
  count: number,
  files?: readonly Pick<FileSummary, 'name' | 'contentType'>[],
): AttachmentHint | null {
  if (count === 0) {
    return null;
  }
  if (files && files.length > 0) {
    if (files.every((file) => file.contentType.startsWith('image/'))) {
      return {
        icon: 'image-outline',
        label: files.length === 1 ? 'Photo' : `${files.length} photos`,
      };
    }
    const [first] = files;
    if (files.length === 1 && first) {
      return { icon: 'attach-outline', label: first.name };
    }
  }
  return { icon: 'attach-outline', label: count === 1 ? 'Attachment' : `${count} attachments` };
}

export type QuoteContent =
  | { kind: 'withdrawn' }
  | { kind: 'unavailable' }
  | { kind: 'quote'; text: string; files: AttachmentHint | null };

/**
 * What a reply's quote shows.
 *
 * `unavailable` wins over everything: the server withholds the original from this reader and sends
 * nothing of it, so there is nothing to draw but that fact. The preview's mention tokens are turned
 * into names like any other body.
 */
export function quoteContent(
  replyTo: MessageReplyRef,
  names: ReadonlyMap<string, string>,
): QuoteContent {
  if (replyTo.unavailable) {
    return { kind: 'unavailable' };
  }
  if (replyTo.deleted) {
    return { kind: 'withdrawn' };
  }
  return {
    kind: 'quote',
    text: spokenBody(replyTo.bodyPreview, names).replace(/\s+/g, ' ').trim(),
    files: attachmentHint(replyTo.attachmentCount),
  };
}

/** Who wrote the quoted line, as the quote names them. */
export function quotedSender(replyTo: MessageReplyRef, viewerId: string | null): string {
  if (replyTo.unavailable) {
    return 'Message';
  }
  if (replyTo.sender && replyTo.sender.id === viewerId) {
    return 'You';
  }
  return replyTo.sender?.name ?? 'Somebody';
}
