import { splitMentions, type UserRef } from '@ashniva/types';
import { Text } from 'react-native';

import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A message body, with its mentions drawn as names.
 *
 * `splitMentions` from `@ashniva/types` is the parser — the same one the web app renders with and
 * the same grammar the send path authorizes against. There is no second token format here and
 * there must not be: a phone that invented one would produce bodies the notification path cannot
 * read.
 *
 * A mention of somebody the screen has no name for still renders as a mention rather than as a
 * raw uuid. "@someone" is the honest fallback, and it is the word the API's own notification line
 * uses.
 *
 * `onBrand` is why the highlight is not simply the brand colour everywhere. The reader's own
 * bubble is painted in the tenant's brand, and the brand is a runtime setting: a mention drawn in
 * that same colour on top of it would be invisible for some tenants and only some tenants, which
 * is the worst kind of theming bug. On the brand, a mention is bold and underlined in the
 * foreground colour the tokens already pair with it.
 */
export function MessageBody({
  body,
  names,
  viewerId,
  onBrand = false,
  highlight = '',
}: {
  body: string;
  /** User id to display name, for the mentions this thread can resolve. */
  names: ReadonlyMap<string, string>;
  /** The reader, so a mention of them is drawn harder than a mention of anybody else. */
  viewerId: string | null;
  onBrand?: boolean;
  /**
   * What the in-thread search is looking for, lowercased. Marked in the text, never inside a
   * mention: the search runs over the stored body, where a mention is an id, not a name.
   */
  highlight?: string;
}) {
  const theme = useTheme();
  const color = onBrand ? theme.colors.primaryText : theme.colors.text;
  const marked = { backgroundColor: theme.colors.warningSoft, color: theme.colors.text };

  return (
    <Text style={{ color, fontSize: theme.fontSize.body, lineHeight: theme.fontSize.body * 1.4 }}>
      {splitMentions(body).map((part, index) =>
        part.kind === 'text' ? (
          // The index is the key because the parts of one body have no ids of their own and the
          // array is rebuilt wholesale whenever the body changes.
          <Text key={index}>
            {highlightParts(part.text, highlight).map((piece, at) =>
              piece.match ? (
                <Text key={at} style={marked}>
                  {piece.text}
                </Text>
              ) : (
                piece.text
              ),
            )}
          </Text>
        ) : (
          <Text
            key={index}
            style={{
              color: onBrand ? theme.colors.primaryText : theme.colors.primary,
              fontWeight: part.userId === viewerId ? '700' : '600',
              textDecorationLine: onBrand ? 'underline' : 'none',
              // A tint behind the name marks where the tag ends — what the reply prefix needs, as
              // it runs straight into the words of the answer. Only off the brand, for the reason
              // above.
              ...(onBrand ? {} : { backgroundColor: theme.colors.primarySoft }),
            }}
          >
            {/* Thin spaces pad the tint so it does not clip the first and last letter. */}
            {onBrand ? '' : '\u2009'}@{names.get(part.userId) ?? 'someone'}
            {onBrand ? '' : '\u2009'}
          </Text>
        ),
      )}
    </Text>
  );
}

/** A run of text cut where the search matches, case-insensitively. One piece when it does not. */
export function highlightParts(text: string, needle: string): { text: string; match: boolean }[] {
  if (!needle) {
    return [{ text, match: false }];
  }
  const pieces: { text: string; match: boolean }[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  let at = lower.indexOf(needle, from);
  while (at !== -1) {
    if (at > from) {
      pieces.push({ text: text.slice(from, at), match: false });
    }
    pieces.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
    at = lower.indexOf(needle, from);
  }
  if (from < text.length) {
    pieces.push({ text: text.slice(from), match: false });
  }
  return pieces;
}

/** The names a thread can resolve a mention against: whoever the conversation lists. */
export function namesOf(participants: readonly UserRef[]): Map<string, string> {
  return new Map(participants.map((participant) => [participant.id, participant.name]));
}
