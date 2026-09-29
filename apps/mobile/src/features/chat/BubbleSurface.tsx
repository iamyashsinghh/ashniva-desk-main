import type { MessageSummary } from '@ashniva/types';
import { StyleSheet, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { formatTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { MessageAttachments } from './MessageAttachments';
import { MessageBody } from './MessageBody';
import { privateAudienceLabel } from './message-labels';
import { ReplyQuote } from './ReplyQuote';

/**
 * The coloured part of a bubble: who a private line is for, the quote it answers, the words, the
 * files and the time.
 *
 * The corner nearest the sender's edge is tightened on the last line of a run, which is what ties
 * a run of lines to its side of the screen without drawing a tail.
 */
export function BubbleSurface({
  message,
  isOwn,
  isRunEnd,
  names,
  viewerId,
  highlight,
  onOpenQuote,
}: {
  message: MessageSummary;
  isOwn: boolean;
  isRunEnd: boolean;
  names: ReadonlyMap<string, string>;
  viewerId: string | null;
  highlight: string;
  onOpenQuote?: ((messageId: string) => void) | undefined;
}) {
  const theme = useTheme();
  const tail = isRunEnd ? theme.radius.xs : theme.radius.lg;
  const isPrivate = message.restrictedToUserIds.length > 0 && !message.deletedAt;

  return (
    <View
      style={{
        backgroundColor: isOwn ? theme.colors.primary : theme.colors.surface,
        borderBottomLeftRadius: isOwn ? theme.radius.lg : tail,
        borderBottomRightRadius: isOwn ? tail : theme.radius.lg,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        // A surface bubble on a dark background needs an edge; in light mode colour does it.
        borderWidth: !isOwn && theme.isDark ? StyleSheet.hairlineWidth : 0,
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {isPrivate ? (
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
          <Icon
            name="lock-closed"
            size={11}
            color={isOwn ? theme.colors.primaryText : theme.colors.warning}
          />
          <AppText
            size="xs"
            weight="medium"
            tone={isOwn ? 'inverse' : 'warning'}
            style={{ flexShrink: 1 }}
          >
            Private · to {privateAudienceLabel(message.restrictedToUserIds, viewerId, names)}
          </AppText>
        </View>
      ) : null}
      {message.replyTo && !message.deletedAt ? (
        <ReplyQuote
          replyTo={message.replyTo}
          names={names}
          viewerId={viewerId}
          onBrand={isOwn}
          onPress={onOpenQuote}
        />
      ) : null}
      {message.deletedAt ? (
        <AppText size="sm" tone={isOwn ? 'inverse' : 'muted'} style={{ fontStyle: 'italic' }}>
          This message was withdrawn.
        </AppText>
      ) : (
        <>
          {message.body ? (
            <MessageBody
              body={message.body}
              names={names}
              viewerId={viewerId}
              onBrand={isOwn}
              highlight={highlight}
            />
          ) : null}
          <MessageAttachments files={message.attachments} />
        </>
      )}

      <AppText
        size="xs"
        tone={isOwn ? 'inverse' : 'muted'}
        align="right"
        tabular
        // The brand's own foreground, softened: still the colour the tokens pair with the brand,
        // so it stays legible on any tenant's colour.
        style={isOwn ? { opacity: 0.8 } : undefined}
      >
        {formatTime(message.createdAt) ?? ''}
        {message.editedAt ? ' · edited' : ''}
      </AppText>
    </View>
  );
}
