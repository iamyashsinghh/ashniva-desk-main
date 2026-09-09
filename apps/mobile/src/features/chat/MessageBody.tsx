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
 * raw uuid. The names come from the conversation's participants, and a project channel's
 * participant list is not its whole audience — somebody may be mentionable and not listed — so
 * "@someone" is the honest fallback, and it is the word the API's own notification line uses.
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
}: {
  body: string;
  /** User id to display name, for the mentions this thread can resolve. */
  names: ReadonlyMap<string, string>;
  /** The reader, so a mention of them is drawn harder than a mention of anybody else. */
  viewerId: string | null;
  onBrand?: boolean;
}) {
  const theme = useTheme();
  const color = onBrand ? theme.colors.primaryText : theme.colors.text;

  return (
    <Text style={{ color, fontSize: theme.fontSize.body, lineHeight: theme.fontSize.body * 1.4 }}>
      {splitMentions(body).map((part, index) =>
        part.kind === 'text' ? (
          // The index is the key because the parts of one body have no ids of their own and the
          // array is rebuilt wholesale whenever the body changes.
          <Text key={index}>{part.text}</Text>
        ) : (
          <Text
            key={index}
            style={{
              color: onBrand ? theme.colors.primaryText : theme.colors.primary,
              fontWeight: part.userId === viewerId ? '700' : '600',
              textDecorationLine: onBrand ? 'underline' : 'none',
            }}
          >
            @{names.get(part.userId) ?? 'someone'}
          </Text>
        ),
      )}
    </Text>
  );
}

/** The names a thread can resolve a mention against: whoever the conversation lists. */
export function namesOf(participants: readonly UserRef[]): Map<string, string> {
  return new Map(participants.map((participant) => [participant.id, participant.name]));
}
