import type { ConversationAudienceMember, FileSummary } from '@ashniva/types';

/** Ids to names, the only thing a quote needs from the roster. */
export function namesOf(
  audience: readonly ConversationAudienceMember[],
): ReadonlyMap<string, string> {
  return new Map(audience.map((person) => [person.id, person.name]));
}

/**
 * What stands in for the words of a message that carried only files.
 *
 * The quote on a reply knows how many files the original had and nothing about them, so it can
 * only count; the composer's reply bar holds the original itself and can say "Photo".
 */
export function attachmentHint(
  count: number,
  files?: readonly Pick<FileSummary, 'name' | 'contentType'>[],
): string {
  const [only] = files ?? [];
  if (count === 0) {
    return 'An empty message';
  }
  if (count === 1 && only) {
    return only.contentType.startsWith('image/') ? 'Photo' : only.name;
  }
  return count === 1 ? 'Attachment' : `${count} attachments`;
}
