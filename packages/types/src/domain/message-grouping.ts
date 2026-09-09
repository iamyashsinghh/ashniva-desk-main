import type { MessageSystemKind } from './conversation';

/**
 * How a thread is broken into days and into runs of consecutive lines by one person.
 *
 * Here rather than in either app because both of them draw the same thread. The web app and the
 * phone had each grown their own loop over the same array, and "was this written on the same day
 * as the line above it" is exactly the kind of question that gets answered two slightly different
 * ways and then disagrees on a screenshot. It is pure, it takes no clock of its own, and it is
 * unit-tested next to this file.
 *
 * It decides nothing about permission. `canEdit`, `canDelete` and the conversation's abilities are
 * the server's answers and travel on the messages themselves; this only decides where a date
 * heading goes and which lines lose their repeated name.
 */

/**
 * The least a message has to be for this to group it.
 *
 * Structural rather than `MessageSummary`, so the helper sits in `domain/` with the rest of the
 * conversation vocabulary instead of dragging the whole API contract in behind it — and so a
 * caller with a narrower row can still use it.
 */
export interface GroupableMessage {
  id: string;
  createdAt: string;
  systemKind: MessageSystemKind | null;
  sender: { id: string } | null;
}

/**
 * How long a gap ends a run.
 *
 * Five minutes: two lines typed in the same breath are one utterance and should not repeat the
 * name and the time, whereas a reply half an hour later is a new thing to say and reads wrongly
 * when it is glued to the message above it.
 */
export const MESSAGE_GROUPING_GAP_MINUTES = 5;

/** Consecutive messages from one person, close enough together to read as one utterance. */
export interface MessageRun<TMessage extends GroupableMessage> {
  /** Stable across a re-render: the id of the run's first message. */
  key: string;
  /** Who wrote them, or null when the system did. */
  senderId: string | null;
  /** True for a run the system wrote — a call starting, a conversation opening. */
  isSystem: boolean;
  messages: TMessage[];
}

/** One calendar day of a thread. */
export interface MessageDaySection<TMessage extends GroupableMessage> {
  /** `YYYY-MM-DD` in the reader's own timezone, and the section's key. */
  day: string;
  /** The first message of the day, so a caller can format the heading however it likes. */
  startedAt: string;
  runs: MessageRun<TMessage>[];
}

/**
 * A thread split into days, and each day into runs.
 *
 * The input is expected oldest-first, which is the order both apps assemble their pages into. A
 * caller that hands it the other order gets sections in that order back rather than a silent
 * re-sort: reordering somebody's conversation is not this function's business.
 */
export function groupMessagesByDay<TMessage extends GroupableMessage>(
  messages: readonly TMessage[],
  gapMinutes: number = MESSAGE_GROUPING_GAP_MINUTES,
): MessageDaySection<TMessage>[] {
  const gapMs = gapMinutes * 60_000;
  const sections: MessageDaySection<TMessage>[] = [];

  for (const message of messages) {
    const day = localDay(message.createdAt);
    let section = sections.at(-1);
    if (!section || section.day !== day) {
      section = { day, startedAt: message.createdAt, runs: [] };
      sections.push(section);
    }

    const run = section.runs.at(-1);
    if (run && continuesRun(run, message, gapMs)) {
      run.messages.push(message);
      continue;
    }
    section.runs.push({
      key: message.id,
      senderId: message.sender?.id ?? null,
      isSystem: message.systemKind !== null,
      messages: [message],
    });
  }

  return sections;
}

/**
 * Whether this message belongs to the run above it.
 *
 * A system note never joins one and never takes one: "a call was started" between two of Priya's
 * lines is a change of speaker in both directions, and hiding her name on the line after it would
 * make the note look like hers.
 */
function continuesRun<TMessage extends GroupableMessage>(
  run: MessageRun<TMessage>,
  message: TMessage,
  gapMs: number,
): boolean {
  if (run.isSystem || message.systemKind !== null) {
    return false;
  }
  const senderId = message.sender?.id ?? null;
  if (senderId === null || run.senderId !== senderId) {
    return false;
  }
  const previous = run.messages.at(-1);
  if (!previous) {
    return false;
  }
  const gap = Date.parse(message.createdAt) - Date.parse(previous.createdAt);
  return Number.isFinite(gap) && gap >= 0 && gap <= gapMs;
}

/**
 * The calendar day an instant falls on **where the reader is**, not in UTC.
 *
 * A message sent at 23:30 in Delhi is an 18:00 UTC timestamp, and slicing the ISO string would
 * file it under the previous day for the person who wrote it. Built from the local parts rather
 * than from `toISOString`, which converts back to UTC and reintroduces the bug.
 */
function localDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    // An unparseable timestamp gets its own section rather than joining somebody else's day.
    return iso;
  }
  const month = `${at.getMonth() + 1}`.padStart(2, '0');
  const date = `${at.getDate()}`.padStart(2, '0');
  return `${at.getFullYear()}-${month}-${date}`;
}

/**
 * Today, yesterday, or the date — the heading a day section carries.
 *
 * `now` is a parameter rather than a `new Date()` inside, because a function that reads the clock
 * cannot be tested for the one case that matters: the boundary.
 */
export function dayHeading(day: string, now: Date = new Date()): 'Today' | 'Yesterday' | null {
  const today = localDay(now.toISOString());
  if (day === today) {
    return 'Today';
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return day === localDay(yesterday.toISOString()) ? 'Yesterday' : null;
}
