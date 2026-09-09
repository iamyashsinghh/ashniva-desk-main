import { splitMentions } from '@ashniva/types';

import { ApiError } from '../../../shared/lib/api-client';

/**
 * Whether a failed send failed because it named somebody this conversation does not reach.
 *
 * `assertMentionsAreReachable` answers 400 rather than dropping the mention, which is the right
 * call on the server — a mention that silently vanishes leaves the sender believing somebody was
 * told — but it means the composer has to recognise the refusal and offer a way through it. The
 * status alone is not enough to go on: a 400 from this endpoint could equally be an over-long body
 * or a bad attachment id, and offering to strip mentions from a message that has none would be
 * nonsense. So both halves are required, and a body with no mention token never takes this path.
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
 * The names come from the picker that inserted them, because they are the only place the id-to-name
 * mapping exists on this screen; a token whose name has been forgotten degrades to `@someone`
 * rather than being left as a raw uuid in front of the reader.
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
    ? `${only} can no longer be mentioned here. Your message has been kept.`
    : 'Somebody you named can no longer be mentioned here. Your message has been kept.';
}
