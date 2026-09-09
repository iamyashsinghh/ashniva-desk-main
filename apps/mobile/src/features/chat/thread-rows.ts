import { groupMessagesByDay, type MessageSummary } from '@ashniva/types';

/**
 * A thread, flattened into the rows a `FlatList` draws.
 *
 * The days and the runs come from `groupMessagesByDay` in `@ashniva/types` — the same function
 * the web app calls, so the two apps cannot disagree about which side of midnight a message fell
 * on. This adds the two things a list of rows needs that a tree of sections does not: a flat
 * array with a stable key per row, and the per-message facts a bubble is drawn from (whose it is,
 * whether it starts or ends a run, whether its sender's name goes above it).
 *
 * Pure, and tested next to this file. Nothing here decides who may read anything — the messages
 * arrived through an endpoint that decided that.
 */

export interface MessageRow {
  kind: 'message';
  key: string;
  message: MessageSummary;
  /** The reader's own line, which is drawn on the right. */
  isOwn: boolean;
  /** Written by the system — a call starting — rather than by a person. */
  isSystem: boolean;
  /** Whether this line carries the sender's name. Only ever the first of a run. */
  showSender: boolean;
  isRunStart: boolean;
  isRunEnd: boolean;
}

export type ThreadRow =
  | MessageRow
  | { kind: 'day'; key: string; day: string; startedAt: string }
  | { kind: 'unread'; key: string; count: number };

/**
 * Where the "new messages" line goes, as an index into `messages`.
 *
 * Reconstructed from the unread count rather than from a read timestamp, because the count is
 * what the API actually computes: messages somebody else sent after this reader's cursor. Walking
 * back from the newest and stopping once that many of somebody else's lines have been passed
 * lands on exactly the boundary the server drew, without the phone having to hold a second idea
 * of when the reader last looked.
 *
 * Null when there is nothing unread, or when the count reaches further back than the history
 * loaded so far — a divider at the top of a partly loaded thread would claim everything above it
 * had been read, which is the one thing it must not say.
 */
export function unreadStartIndex(
  messages: readonly MessageSummary[],
  viewerId: string | null,
  unreadCount: number,
): number | null {
  if (unreadCount <= 0) {
    return null;
  }
  let remaining = unreadCount;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as MessageSummary;
    if (message.sender && message.sender.id !== viewerId) {
      remaining -= 1;
      if (remaining === 0) {
        return index;
      }
    }
  }
  return null;
}

export interface ThreadRowOptions {
  viewerId: string | null;
  /** How many messages were unread when the thread was opened. Zero draws no divider. */
  unreadCount: number;
}

/**
 * The rows of a thread, oldest first.
 *
 * The screen renders them into an inverted list, which reverses this array: a row that should sit
 * *above* a day's messages therefore comes *before* them here, which is the order they read in.
 */
export function threadRows(
  messages: readonly MessageSummary[],
  options: ThreadRowOptions,
): ThreadRow[] {
  const dividerAt = unreadStartIndex(messages, options.viewerId, options.unreadCount);
  const dividerId = dividerAt === null ? null : messages[dividerAt]?.id;

  const rows: ThreadRow[] = [];
  for (const section of groupMessagesByDay(messages)) {
    rows.push({
      kind: 'day',
      key: `day:${section.day}`,
      day: section.day,
      startedAt: section.startedAt,
    });
    for (const run of section.runs) {
      run.messages.forEach((message, index) => {
        if (message.id === dividerId) {
          rows.push({ kind: 'unread', key: 'unread', count: options.unreadCount });
        }
        rows.push({
          kind: 'message',
          key: message.id,
          message,
          isOwn: message.sender !== null && message.sender.id === options.viewerId,
          isSystem: run.isSystem,
          // The name goes on the first line of a run and nowhere else: repeating it under every
          // line of one utterance is the noise the run grouping exists to remove.
          showSender: index === 0,
          isRunStart: index === 0,
          isRunEnd: index === run.messages.length - 1,
        });
      });
    }
  }
  return rows;
}
