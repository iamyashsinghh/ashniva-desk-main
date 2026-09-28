import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type TextInputProps } from 'react-native';

import { Glyph } from '../../shared/components/glyph';
import { Input } from '../../shared/components/primitives';
import { DISABLED_OPACITY, TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * The composer's one bar: the two attach actions, the field, and Send.
 *
 * Round actions either side of a rounded field, which is the shape every phone chat has taught
 * people to look for at the bottom of a thread. The buttons are 40 points to draw and 44 to hit.
 */

const ROUND = 40;
/** The field's corner: half its resting height, so one line reads as a pill and a long draft does not clip. */
const FIELD_RADIUS = TOUCH_TARGET / 2;

export function ComposerBar({
  attachDisabled,
  onAttachPhoto,
  onAttachFile,
  field,
  sendBusy,
  sendDisabled,
  onSend,
  children,
}: {
  attachDisabled: boolean;
  onAttachPhoto: () => void;
  onAttachFile: () => void;
  /** Everything the message field needs; its label and value are the composer's business. */
  field: TextInputProps;
  sendBusy: boolean;
  sendDisabled: boolean;
  onSend: () => void;
  /** Whatever sits above the bar in the same tray: attachments waiting, a failed send. */
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {children}
      <View style={{ alignItems: 'flex-end', flexDirection: 'row', gap: theme.spacing.xs + 2 }}>
        <RoundAction
          label="Attach a photo"
          disabled={attachDisabled}
          onPress={onAttachPhoto}
          icon={<PhotoIcon color={theme.colors.textMuted} />}
        />
        <RoundAction
          label="Attach a file"
          disabled={attachDisabled}
          onPress={onAttachFile}
          icon={<Glyph name="plus" color={theme.colors.textMuted} size={16} />}
        />
        <View style={{ flex: 1 }}>
          <Input
            {...field}
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
              <Glyph name="arrow-up" color={theme.colors.primaryText} size={16} strokeWidth={2.4} />
            )
          }
        />
      </View>
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
  onPress,
}: {
  label: string;
  accessibilityHint?: string;
  icon: React.ReactNode;
  disabled: boolean;
  busy?: boolean;
  primary?: boolean;
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
        backgroundColor: primary ? theme.colors.primary : theme.colors.surfaceSunken,
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

/** A picture frame with a sun in it: the glyph set has no photo, and a second plus would be ambiguous. */
function PhotoIcon({ color }: { color: string }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ borderColor: color, borderRadius: 3, borderWidth: 1.8, height: 14, width: 18 }}
    >
      <View
        style={{
          backgroundColor: color,
          borderRadius: 2,
          height: 4,
          left: 2,
          position: 'absolute',
          top: 2,
          width: 4,
        }}
      />
    </View>
  );
}

/** Two states rather than a nested ternary, as in `primitives.tsx`. */
function pressOpacity(inactive: boolean, pressed: boolean): number {
  if (inactive) {
    return DISABLED_OPACITY;
  }
  return pressed ? 0.8 : 1;
}
