import { useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type TextInput,
  type TextInputProps,
} from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { Input } from '../../shared/components/primitives';
import { DISABLED_OPACITY, TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { AttachMenu } from './AttachMenu';

/**
 * The composer's one bar: "+" for attachments, the field, and Send.
 *
 * The shape every phone chat has taught people to look for at the bottom of a thread. The bar's
 * own background runs down under the home indicator (`bottomInset`), so the wallpaper never shows
 * as a strip between the bar and the bottom of the screen. The buttons are 40 points to draw and
 * 44 to hit.
 */

const ROUND = 40;
/** The field's corner: half its resting height, so one line reads as a pill and a long draft does not clip. */
const FIELD_RADIUS = TOUCH_TARGET / 2;

export function ComposerBar({
  attachDisabled,
  onAttachPhoto,
  onAttachCamera,
  onAttachFile,
  bottomInset = 0,
  field,
  fieldRef,
  sendBusy,
  sendDisabled,
  onSend,
  children,
}: {
  attachDisabled: boolean;
  onAttachPhoto: () => void;
  onAttachCamera: () => void;
  onAttachFile: () => void;
  /** The home indicator's height, drawn in the bar's colour; zero while the keyboard covers it. */
  bottomInset?: number;
  /** Everything the message field needs; its label and value are the composer's business. */
  field: TextInputProps;
  /** So the composer can put the caret in the field — when a reply is chosen, for instance. */
  fieldRef?: Ref<TextInput>;
  sendBusy: boolean;
  sendDisabled: boolean;
  onSend: () => void;
  /** Whatever sits above the bar in the same tray: attachments waiting, a failed send. */
  children?: ReactNode;
}) {
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: theme.spacing.sm,
        paddingBottom: theme.spacing.sm + bottomInset,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
      }}
    >
      {children}
      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: theme.spacing.xs }}>
        <RoundAction
          label="Attach"
          accessibilityHint="Take a photo, choose a photo or attach a document"
          disabled={attachDisabled}
          onPress={() => setMenuOpen(true)}
          plain
          icon={<Glyph name="plus" color={theme.colors.primary} size={26} />}
        />
        <View style={{ flex: 1 }}>
          <Input
            {...field}
            {...(fieldRef ? { ref: fieldRef } : {})}
            multiline
            // Grows with the text and then scrolls, so the keyboard is never pushed off and a
            // long message never takes the whole screen.
            style={{
              borderRadius: FIELD_RADIUS,
              maxHeight: 120,
              minHeight: TOUCH_TARGET,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.sm + 2,
              textAlignVertical: 'top',
            }}
          />
        </View>
        <RoundAction
          label="Send"
          accessibilityHint="Sends the message to this conversation"
          disabled={sendDisabled}
          busy={sendBusy}
          onPress={onSend}
          primary
          icon={
            sendBusy ? (
              <ActivityIndicator color={theme.colors.primaryText} />
            ) : (
              <View style={{ marginLeft: 2 }}>
                <Glyph name="send" color={theme.colors.primaryText} size={15} />
              </View>
            )
          }
        />
      </View>
      <AttachMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCamera={onAttachCamera}
        onPhotos={onAttachPhoto}
        onDocument={onAttachFile}
      />
    </View>
  );
}

/** A round action beside the field. Labelled for a screen reader; a drawn glyph for everyone else. */
function RoundAction({
  label,
  accessibilityHint,
  icon,
  disabled,
  busy = false,
  primary = false,
  plain = false,
  onPress,
}: {
  label: string;
  accessibilityHint?: string;
  icon: React.ReactNode;
  disabled: boolean;
  busy?: boolean;
  primary?: boolean;
  /** No fill: a bare icon, for the action that should not compete with Send. */
  plain?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      hitSlop={(TOUCH_TARGET - ROUND) / 2}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: roundFill(theme.colors, primary, plain),
        borderRadius: ROUND / 2,
        height: ROUND,
        justifyContent: 'center',
        // Level with a one-line field, which rests at the full touch height.
        marginBottom: (TOUCH_TARGET - ROUND) / 2,
        opacity: pressOpacity(inactive, pressed),
        transform: [{ scale: pressed && !inactive ? 0.94 : 1 }],
        width: ROUND,
      })}
    >
      {icon}
    </Pressable>
  );
}

function roundFill(
  colors: { primary: string; surfaceSunken: string },
  primary: boolean,
  plain: boolean,
): string {
  if (primary) {
    return colors.primary;
  }
  return plain ? 'transparent' : colors.surfaceSunken;
}

/** Two states rather than a nested ternary, as in `primitives.tsx`. */
function pressOpacity(inactive: boolean, pressed: boolean): number {
  if (inactive) {
    return DISABLED_OPACITY;
  }
  return pressed ? 0.8 : 1;
}
