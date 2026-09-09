import { splitMentions, type ConversationAudienceMember } from '@ashniva/types';
import { Fragment, type ReactNode } from 'react';

export interface MessageBodyProps {
  body: string;
  /** The people this conversation reaches, from the server. Used only to put names to ids. */
  audience: readonly ConversationAudienceMember[];
  /** What the in-thread search is looking for, lowercased. Empty means "not searching". */
  highlight?: string;
  /** Whether the viewer is named in this message, so the bubble can say so. */
  className?: string;
}

/**
 * A message body, with `@[uuid]` rendered as the person's name.
 *
 * A mention is stored as an id and never as a name, so that it survives a rename and cannot be
 * forged by typing a colleague's name into a line. That means the thread is the only place with
 * both halves — the ids in the body and the roster from the server — and this is where they meet.
 *
 * An id that resolves to nobody renders as `@someone` rather than as itself. That case is not
 * hypothetical: it is what a mention of somebody since removed from the project looks like, and
 * the honest answer there is that the reader no longer has a colleague to point at. Showing the
 * uuid instead would print an identifier at somebody, which is what the notification line and the
 * conversation-list preview have always refused to do.
 *
 * Search terms are marked in the *text* parts only. A mention is rendered from the roster rather
 * than from the body, so highlighting inside one would mark a string that is not in the message.
 */
export function MessageBody({ body, audience, highlight = '', className }: MessageBodyProps) {
  const names = new Map(audience.map((person) => [person.id, person.name]));
  return (
    <p className={['chat-message__body', className].filter(Boolean).join(' ')}>
      {splitMentions(body).map((part, index) =>
        part.kind === 'text' ? (
          <Fragment key={index}>{marked(part.text, highlight)}</Fragment>
        ) : (
          <span key={index} className="chat-mention">
            {`@${names.get(part.userId) ?? 'someone'}`}
          </span>
        ),
      )}
    </p>
  );
}

/** The text, with every case-insensitive occurrence of `needle` wrapped in a `<mark>`. */
function marked(text: string, needle: string): ReactNode {
  if (needle.length === 0) {
    return text;
  }
  const pieces: ReactNode[] = [];
  const haystack = text.toLowerCase();
  let cursor = 0;
  let found = haystack.indexOf(needle);
  while (found !== -1) {
    if (found > cursor) {
      pieces.push(text.slice(cursor, found));
    }
    pieces.push(
      <mark key={found} className="chat-message__hit">
        {text.slice(found, found + needle.length)}
      </mark>,
    );
    cursor = found + needle.length;
    found = haystack.indexOf(needle, cursor);
  }
  pieces.push(text.slice(cursor));
  return pieces;
}
