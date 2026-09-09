import { maskMentions } from '@ashniva/types';

/** How much of a message is quoted before it is cut. */
const PREVIEW_LIMIT = 140;

/** Only the field the preview reads, so both callers' row shapes satisfy it. */
export interface PreviewAttachment {
  name: string;
}

/**
 * What a message says when it is quoted away from its thread.
 *
 * One function for two places that must agree — the conversation list's `lastMessagePreview` and
 * the line a notification carries. They were the same six lines copied into two files, which was
 * survivable while the only rule was "mask the mentions and cut at 140"; it stopped being
 * survivable the moment a message could have no words at all, because then the two copies would
 * have had to invent the same sentence independently.
 *
 * **Mentions are masked, not resolved.** Neither caller has a roster to resolve them against, and
 * a raw uuid in a one-line quote reads as a leaked identifier rather than as somebody being
 * addressed. That is the behaviour both copies already had.
 *
 * **A message with no words is described by its attachments.** Named where there is one, counted
 * where there are several, because the name is the useful thing until there are too many names to
 * read — and a file name is a thing the sender chose, so it is quoted, not paraphrased. The
 * sender is deliberately *not* part of this string: the notification puts them in its title
 * ("Priya S messaged you") and the conversation list draws them as the row's own heading, so
 * repeating the name here would say it twice in both places.
 *
 * The result is safe to show wherever the body itself may be shown, and nowhere else — see the
 * note on visibility in `toMessageFileSummary`, and the client boundary in
 * `CommunicationController`.
 */
export function messagePreview(body: string, attachments: readonly PreviewAttachment[]): string {
  const words = condense(body);
  if (words.length > 0) {
    return shorten(words);
  }
  if (attachments.length === 1) {
    // Non-null: the length was just checked. `at(0)` would need the same assertion with an extra
    // `?? ''` that could never fire.
    return shorten(`Sent ${condense((attachments[0] as PreviewAttachment).name)}`);
  }
  if (attachments.length > 1) {
    return `Sent ${attachments.length} files`;
  }
  // Nothing to say.
  //
  // The send path refuses a message carrying neither — in the request, and again when a named
  // attachment turns out not to be adoptable, which is how a blank row used to be written past
  // that first check. This branch is therefore for rows that already exist rather than for new
  // ones, and a preview is not the place to raise over one.
  return '';
}

/** One line, no runs of space, no raw mention ids. Applied to a file name too, so there is one rule. */
function condense(text: string): string {
  return maskMentions(text).replace(/\s+/g, ' ').trim();
}

function shorten(text: string): string {
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text;
}
