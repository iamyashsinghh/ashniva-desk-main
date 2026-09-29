import {
  decodeMentions,
  encodeMentions,
  MAX_MENTIONABLE_QUERY_LENGTH,
  MIN_MENTIONABLE_QUERY_LENGTH,
} from '@ashniva/types';

/**
 * The `@` the person is currently typing, and how a chosen name goes into the draft.
 *
 * Pure string work, kept out of the composer so it can be tested without a keyboard. The field
 * shows `@Name`, because a uuid in the box someone is typing into is unreadable; the body that is
 * sent carries `@[<uuid>]`, the grammar `mentionsIn` and `splitMentions` in `@ashniva/types` parse
 * and the send path intersects with the conversation's audience. `draftToBody` is the one
 * crossing, and only names chosen from the picker cross it — a name typed by hand stays text, so
 * a mention still cannot be forged by typing one.
 */

/** The people picked into a draft, by id: what `draftToBody` turns back into mentions. */
export type MentionNames = ReadonlyMap<string, string>;

/** The body to send for a draft whose picked names are `names`. */
export function draftToBody(draft: string, names: MentionNames): string {
  return encodeMentions(
    draft,
    [...names].map(([userId, name]) => ({ userId, name })),
  );
}

/** A stored body as the field shows it, for editing, with the picks saving needs to write back. */
export function bodyToDraft(
  body: string,
  known: MentionNames,
): { draft: string; names: Map<string, string> } {
  const decoded = decodeMentions(body, known);
  return {
    draft: decoded.text,
    names: new Map(decoded.picks.map((pick) => [pick.userId, pick.name])),
  };
}

/** The word the caret is inside, when that word is an unfinished mention. */
export interface MentionDraft {
  /** What has been typed after the `@`, without it. May be empty, the instant `@` is pressed. */
  term: string;
  /** Where the `@` is, and where the caret is: the span a chosen name replaces. */
  start: number;
  end: number;
}

/**
 * The mention being typed at `caret`, or null.
 *
 * Deliberately narrow. It looks back to the nearest whitespace and requires an `@` there, so a
 * mid-word `@` in an email address does not open the picker; and it refuses a token containing
 * `[`, so a mention that has already been inserted is not re-parsed as a search for a uuid.
 */
export function activeMention(text: string, caret: number): MentionDraft | null {
  const position = Math.max(0, Math.min(caret, text.length));
  const before = text.slice(0, position);
  const at = before.lastIndexOf('@');
  if (at < 0) {
    return null;
  }
  // An `@` glued to the end of a word — `sam@example.com` — is an address, not a mention.
  if (at > 0 && !/\s/.test(before.charAt(at - 1))) {
    return null;
  }
  const term = before.slice(at + 1);
  if (/[\s[\]]/.test(term) || term.length > MAX_MENTIONABLE_QUERY_LENGTH) {
    return null;
  }
  return { term, start: at, end: position };
}

/**
 * The search term to send for a draft, or null to ask for the head of the audience instead.
 *
 * Below `MIN_MENTIONABLE_QUERY_LENGTH` the endpoint answers with the audience in name order
 * rather than scanning it, which is the same first page the picker shows before anybody types —
 * so sending one or two characters would buy a different answer for no benefit.
 */
export function mentionSearchTerm(draft: MentionDraft | null): string | null {
  if (!draft || draft.term.length < MIN_MENTIONABLE_QUERY_LENGTH) {
    return null;
  }
  return draft.term;
}

/** A draft with the chosen person's name written into it, and where the caret lands afterwards. */
export function insertMention(
  text: string,
  draft: MentionDraft,
  name: string,
): { text: string; caret: number } {
  const token = `@${name.trim()} `;
  return {
    text: `${text.slice(0, draft.start)}${token}${text.slice(draft.end)}`,
    caret: draft.start + token.length,
  };
}
