import type { MessageSummary } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { Icon } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { spokenBody } from './message-labels';
import { attachmentHint } from './reply-labels';

/**
 * The message being answered, pinned above the text field, with a way to stop answering it.
 *
 * The same quote the sent reply will carry — the sender, a line or two of what they said, a hint
 * for a photo — so what is being answered is never a guess. The send carries the original's id as
 * `replyToId`, and the server both quotes it and tells its sender.
 */
export function ReplyPreview({
  replyingTo,
  names,
  viewerId,
  onCancel,
}: {
  replyingTo: MessageSummary;
  names: ReadonlyMap<string, string>;
  viewerId: string | null;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const who =
    viewerId !== null && replyingTo.sender?.id === viewerId
      ? 'You'
      : (replyingTo.sender?.name ?? 'Somebody');
  const text = spokenBody(replyingTo.body, names).replace(/\s+/g, ' ').trim();
  const files = attachmentHint(replyingTo.attachments.length, replyingTo.attachments);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surfaceSunken,
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        overflow: 'hidden',
      }}
    >
      <View style={{ alignSelf: 'stretch', backgroundColor: theme.colors.primary, width: 4 }} />
      <View
        accessible
        accessibilityLabel={`Replying to ${who}: ${text || files || 'a message'}`}
        style={{
          flex: 1,
          gap: 2,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.sm,
        }}
      >
        <AppText size="xs" weight="bold" tone="primary" numberOfLines={1}>
          {who}
        </AppText>
        {files ? (
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
            <Icon name={files.icon} size={13} color={theme.colors.textMuted} />
            <AppText size="sm" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {files.label}
            </AppText>
          </View>
        ) : null}
        {text ? (
          <AppText size="sm" tone="muted" numberOfLines={2}>
            {text}
          </AppText>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Stop replying to ${who}`}
        hitSlop={6}
        onPress={onCancel}
        style={({ pressed }) => ({
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: TOUCH_TARGET,
          minWidth: TOUCH_TARGET,
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <View
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.border,
            borderRadius: theme.radius.pill,
            height: 22,
            justifyContent: 'center',
            width: 22,
          }}
        >
          <Glyph name="close" color={theme.colors.textMuted} size={10} />
        </View>
      </Pressable>
    </View>
  );
}
