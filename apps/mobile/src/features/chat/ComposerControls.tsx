import {
  COMMUNICATION_REFUSAL_LABELS,
  MAX_MESSAGE_LENGTH,
  type CommunicationRefusal,
  type FileSummary,
} from '@ashniva/types';
import { Pressable, StyleSheet, View } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { Icon } from '../../shared/components/Icon';
import { AppText, Button } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { isUnreachableMentionRefusal, mentionRefusalMessage } from './mention-refusal';

/** The small pieces of the composer, split out so `MessageComposer` stays readable. */

/**
 * What a failed send says, and what it offers next.
 *
 * The sentence is always the API's own. The extra button appears for one case only: the API
 * refusing a mention of somebody outside the conversation's audience. Pressing it re-sends the
 * *same text* with the mentions written out as plain names, and the draft is untouched either way
 * — so backing out costs nothing and nothing typed is lost.
 *
 * **The status is not the condition, and used to be.** A 400 on a body naming somebody was taken
 * as a refused mention, which meant an over-long body, a bad attachment id or a `clientMessageId`
 * past its own limit was diagnosed as a mention problem and offered a remedy that could not fix
 * it. `isUnreachableMentionRefusal` reads the API's own error as well — the same discrimination
 * the web app makes, in the same place, for the same reason.
 */
export function SendFailure({
  error,
  cause,
  body,
  names,
  onSendWithoutMentions,
}: {
  error: string | null;
  cause: unknown;
  body: string;
  /** User id to display name, for the mentions this composer inserted. */
  names: ReadonlyMap<string, string>;
  onSendWithoutMentions: () => void;
}) {
  const theme = useTheme();
  if (!error) {
    return null;
  }

  const refusedMention = isUnreachableMentionRefusal(cause, body);

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText tone="danger" size="sm">
        {error}
      </AppText>
      {refusedMention ? (
        <>
          <AppText size="xs" tone="muted">
            {mentionRefusalMessage(body, names)}
          </AppText>
          <Button
            label="Send without the mention"
            icon="send"
            variant="secondary"
            size="sm"
            onPress={onSendWithoutMentions}
            style={{ alignSelf: 'flex-start' }}
          />
        </>
      ) : null}
    </View>
  );
}

/** What is waiting to go with the next message, and a way to take one back off. */
export function AttachmentStrip({
  files,
  onRemove,
}: {
  files: readonly FileSummary[];
  onRemove: (fileId: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs + 2 }}>
      {files.map((file) => (
        <View
          key={file.id}
          style={{
            alignItems: 'center',
            backgroundColor: theme.colors.surfaceSunken,
            borderRadius: theme.radius.pill,
            flexDirection: 'row',
            gap: theme.spacing.xs,
            maxWidth: '100%',
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.xs,
          }}
        >
          <Icon name="document-attach-outline" size={14} color={theme.colors.primary} />
          <View style={{ flexShrink: 1 }}>
            <AppText size="xs" weight="medium" numberOfLines={1}>
              {file.name}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${file.name}`}
            hitSlop={8}
            onPress={() => onRemove(file.id)}
            style={({ pressed }) => ({
              alignItems: 'center',
              flexDirection: 'row',
              gap: 4,
              minHeight: TOUCH_TARGET - 12,
              opacity: pressed ? 0.6 : 1,
              paddingHorizontal: theme.spacing.xs + 2,
            })}
          >
            <Glyph name="close" color={theme.colors.danger} size={10} />
            <AppText size="xs" tone="danger" weight="medium">
              Remove
            </AppText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** Why the last attach failed, or that the draft is too long to send: said above the bar. */
export function ComposerNotices({
  attachError,
  length,
}: {
  attachError: string | null;
  /** The draft's length, which is only mentioned once it is over the limit. */
  length: number;
}) {
  return (
    <>
      {attachError ? (
        <AppText tone="danger" size="sm">
          {attachError}
        </AppText>
      ) : null}
      {length > MAX_MESSAGE_LENGTH ? (
        <AppText tone="danger" size="sm">
          {length} of {MAX_MESSAGE_LENGTH} characters. Shorten it to send.
        </AppText>
      ) : null}
    </>
  );
}

/** Said above the bar while a group message tags somebody, because that makes it private. */
export function PrivateNotice() {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}
    >
      <Icon name="lock-closed" size={12} color={theme.colors.warning} />
      <AppText size="xs" tone="warning" style={{ flexShrink: 1 }}>
        Private message: only the people you tag, Super Admins and Project Managers will see it.
      </AppText>
    </View>
  );
}

/** In place of the composer when nobody may post: the API's own reason, in a quiet strip. */
export function ComposerClosed({
  reason,
  bottomInset = 0,
}: {
  reason: CommunicationRefusal | null;
  bottomInset?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        gap: theme.spacing.sm,
        justifyContent: 'center',
        paddingBottom: theme.spacing.md + bottomInset,
        paddingHorizontal: theme.spacing.screen,
        paddingTop: theme.spacing.md,
      }}
    >
      <Icon name="lock-closed-outline" size={15} color={theme.colors.textMuted} />
      <AppText size="sm" tone="muted" align="center" style={{ flexShrink: 1 }}>
        {reason ? COMMUNICATION_REFUSAL_LABELS[reason] : 'You cannot post here.'}
      </AppText>
    </View>
  );
}
