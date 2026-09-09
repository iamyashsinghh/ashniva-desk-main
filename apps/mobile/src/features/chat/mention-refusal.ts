import { splitMentions } from '@ashniva/types';

import { ApiError } from '../../shared/api/client';

/**
 * A refused mention, and the way out of it.
 *
 * Deliberately the same three functions as the web app's `mention-refusal.ts`, with the same
 * answers. Two screens drawing the same refusal should not diagnose it differently or offer
 * different remedies for it, and where this file and that one disagreed, this one was wrong.
 */

/**
 * Whether a failed send failed because it named somebody this conversation does not reach.
 *
 * `assertMentionsAreReachable` answers 400 rather than dropping the mention, which is the right
 * call on the server — a mention that silently vanishes leaves the sender believing somebody was
 * told — but it means the composer has to recognise the refusal and offer a way through it.
 *
 * **The status alone is not enough to go on.** A 400 from this endpoint could equally be an
 * over-long body, a bad attachment id or a `clientMessageId` past its own limit, and answering one
 * of those with "that person can no longer be mentioned here" is a wrong diagnosis attached to a
 * remedy that cannot work: sending the same words without the mention fails again, identically.
 * So the API's own sentence is read as well, and a body with no mention token never takes this
 * path — offering to strip mentions from a message that has none reads as the product having lost
 * track of what was written.
 */
export function isUnreachableMentionRefusal(cause: unknown, body: string): boolean {
  if (!(cause instanceof ApiError) || cause.status !== 400) {
    return false;
  }
  return (
    /mention/i.test(cause.message) && splitMentions(body).some((part) => part.kind === 'mention')
  );
}

/**
 * The same message with its mentions written out as ordinary names.
 *
 * The point is that nothing anybody typed is lost. `@[uuid]` becomes the name that token was
 * displaying, so the sentence still reads as it was written and still says who it is addressed to
 * — it simply no longer carries a notification to somebody the server says is not here any more.
 *
 * This used to delete the token instead, on the argument that a name in the body would read as a
 * mention and be one to nobody. Rewriting is the better default and matches the web app on
 * purpose: the sender is not silently edited, and the reader still knows who was being answered.
 *
 * `splitMentions` from `@ashniva/types` is the parser, here and in `MessageBody`. The grammar has
 * one definition and this file is not a second one.
 *
 * The names come from the picker that inserted them, because they are the only place the
 * id-to-name mapping exists on this screen; a token whose name has been forgotten degrades to
 * `@someone` rather than being left as a raw uuid in front of the reader.
 */
export function withMentionsAsPlainText(body: string, names: ReadonlyMap<string, string>): string {
  return splitMentions(body)
    .map((part) =>
      part.kind === 'mention' ? `@${names.get(part.userId) ?? 'someone'}` : part.text,
    )
    .join('');
}

/**
 * What to tell somebody whose mention was refused.
 *
 * Named where the name is known and there is only one of them, because "Priya can no longer be
 * mentioned here" is actionable and "a mention was refused" is not. The plural case stays vague on
 * purpose: the API reports that *something* in the body was unreachable without saying which id,
 * and guessing at one would be worse than not naming any.
 */
export function mentionRefusalMessage(body: string, names: ReadonlyMap<string, string>): string {
  const mentioned = splitMentions(body).flatMap((part) =>
    part.kind === 'mention' ? [names.get(part.userId)] : [],
  );
  const only = mentioned.length === 1 ? mentioned[0] : undefined;
  return only
    ? `${only} can no longer be mentioned here. Your message is still below — send it without the mention, or edit it first.`
    : 'Somebody you named can no longer be mentioned here. Your message is still below — send it without the mention, or edit it first.';
}
