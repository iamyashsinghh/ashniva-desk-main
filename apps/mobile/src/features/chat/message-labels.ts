import { splitMentions, type MessageSummary } from '@ashniva/types';

import { formatTime } from '../../shared/format/format';
import type { MessageRow } from './thread-rows';

/**
 * Who a private line was written to: the tagged people by name, the reader as "you", in the
 * order they were tagged. The same words the web app prints over the same message.
 */
export function privateAudienceLabel(
  userIds: readonly string[],
  viewerId: string | null,
  names: ReadonlyMap<string, string>,
): string {
  return userIds
    .map((userId) => (userId === viewerId ? 'you' : (names.get(userId) ?? 'somebody')))
    .join(', ');
}

/** A body with its mentions as names, for somewhere a mention cannot be drawn — a spoken label. */
export function spokenBody(body: string, names: ReadonlyMap<string, string>): string {
  return splitMentions(body)
    .map((part) => (part.kind === 'text' ? part.text : `@${names.get(part.userId) ?? 'someone'}`))
    .join('');
}

/**
 * A message in one short line, for the reply preview and the action sheet.
 *
 * A message that is only a file says which file, because an empty quote reads as a bug; a
 * withdrawn one says so rather than quoting words that are no longer there.
 */
export function messageSnippet(
  message: MessageSummary,
  names: ReadonlyMap<string, string>,
): string {
  if (message.deletedAt) {
    return 'This message was withdrawn.';
  }
  const text = spokenBody(message.body, names).replace(/\s+/g, ' ').trim();
  if (text) {
    return text;
  }
  const [first, ...rest] = message.attachments;
  if (!first) {
    return 'An empty message';
  }
  return rest.length > 0 ? `${first.name} and ${rest.length} more` : first.name;
}

/** One sentence per bubble, so a screen reader is not read a name, a body and a time separately. */
export function bubbleAccessibilityLabel(
  row: MessageRow,
  senderName: string,
  names: ReadonlyMap<string, string>,
): string {
  const who = row.isOwn ? 'You' : senderName;
  const what = row.message.deletedAt
    ? 'withdrew a message'
    : `said ${spokenBody(row.message.body, names)}`;
  const when = formatTime(row.message.createdAt) ?? '';
  return `${who} ${what}, ${when}`;
}
