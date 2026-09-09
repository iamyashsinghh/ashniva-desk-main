import { type FileSummary } from '@ashniva/types';
import { Pressable, StyleSheet, View } from 'react-native';

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
            variant="secondary"
            onPress={onSendWithoutMentions}
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
    <View style={{ gap: theme.spacing.xs }}>
      {files.map((file) => (
        <View
          key={file.id}
          style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}
        >
          <View style={{ flex: 1 }}>
            <AppText size="xs" tone="muted" numberOfLines={1}>
              {file.name}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${file.name}`}
            hitSlop={12}
            onPress={() => onRemove(file.id)}
            style={{ justifyContent: 'center', minHeight: TOUCH_TARGET }}
          >
            <AppText size="sm" tone="danger">
              Remove
            </AppText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** A square action beside the field. Labelled for a screen reader; a glyph for everyone else. */
export function IconAction({
  label,
  glyph,
  disabled,
  onPress,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: StyleSheet.hairlineWidth,
        height: TOUCH_TARGET,
        justifyContent: 'center',
        opacity: pressOpacity(disabled, pressed),
        width: TOUCH_TARGET,
      })}
    >
      <AppText size="lg">{glyph}</AppText>
    </Pressable>
  );
}

/** Two states rather than a nested ternary, as in `primitives.tsx`. */
function pressOpacity(disabled: boolean, pressed: boolean): number {
  if (disabled) {
    return 0.5;
  }
  return pressed ? 0.7 : 1;
}
