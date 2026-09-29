import type { MessageReplyRef } from '@ashniva/types';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { quoteContent, quotedSender } from './reply-labels';

/**
 * The line a reply answers, quoted at the top of its bubble.
 *
 * On the reader's own brand-coloured bubble the quote sits on the soft brand wash rather than on
 * the brand itself, so its words are in the ordinary text colour and stay readable whatever colour
 * a tenant chose. Tapping it goes to the original, when there is an original to go to.
 */
export function ReplyQuote({
  replyTo,
  names,
  viewerId,
  onBrand,
  onPress,
}: {
  replyTo: MessageReplyRef;
  names: ReadonlyMap<string, string>;
  viewerId: string | null;
  onBrand: boolean;
  onPress?: ((messageId: string) => void) | undefined;
}) {
  const theme = useTheme();
  const content = quoteContent(replyTo, names);
  const who = quotedSender(replyTo, viewerId);
  const canOpen = Boolean(onPress) && content.kind !== 'unavailable';

  let body: ReactNode;
  if (content.kind === 'unavailable') {
    body = <QuoteNote text="Message unavailable" />;
  } else if (content.kind === 'withdrawn') {
    body = <QuoteNote text="This message was withdrawn" />;
  } else {
    body = (
      <>
        {content.files ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
            <Icon name={content.files.icon} size={12} color={theme.colors.textMuted} />
            <AppText size="xs" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {content.files.label}
            </AppText>
          </View>
        ) : null}
        {content.text ? (
          <AppText size="sm" tone="muted" numberOfLines={2}>
            {content.text}
          </AppText>
        ) : null}
      </>
    );
  }

  return (
    <Pressable
      testID="reply-quote"
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityLabel={`In reply to ${who}`}
      accessibilityHint={canOpen ? 'Shows the message this answers' : undefined}
      disabled={!canOpen}
      onPress={() => onPress?.(replyTo.id)}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        backgroundColor: onBrand ? theme.colors.primarySoft : theme.colors.surfaceSunken,
        borderRadius: theme.radius.sm,
        flexDirection: 'row',
        opacity: pressed ? 0.75 : 1,
        overflow: 'hidden',
      })}
    >
      <View style={{ backgroundColor: theme.colors.primary, width: 3 }} />
      <View
        style={{
          flexShrink: 1,
          gap: 1,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        {content.kind === 'unavailable' ? null : (
          <AppText size="xs" weight="bold" tone="primary" numberOfLines={1}>
            {who}
          </AppText>
        )}
        {body}
      </View>
    </Pressable>
  );
}

function QuoteNote({ text }: { text: string }) {
  return (
    <AppText size="sm" tone="muted" style={{ fontStyle: 'italic' }}>
      {text}
    </AppText>
  );
}
