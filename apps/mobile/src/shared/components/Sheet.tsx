import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { AppText } from './primitives';

/**
 * A bottom sheet: the phone's answer to the web's dialog.
 *
 * Built on the platform `Modal` rather than a gesture library, so it needs no native module
 * beyond what Expo Go already ships. The scrim closes it, as does the hardware back button on
 * Android; a sheet that can only be closed by a button inside it traps somebody who opened it by
 * mistake.
 */
export function Sheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
  footer,
  scroll = true,
  maxHeightRatio = 0.85,
  onDismiss,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the content: the sheet's actions. */
  footer?: ReactNode;
  /** Off for content that scrolls itself, such as a FlatList. */
  scroll?: boolean;
  maxHeightRatio?: number;
  /**
   * iOS only: runs once the sheet has finished sliding away. Anything that presents its own screen
   * — a camera, a photo picker — has to wait for this, because iOS refuses to present over a
   * modal that is still being dismissed.
   */
  onDismiss?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{
            backgroundColor: theme.colors.overlay,
            bottom: 0,
            left: 0,
            position: 'absolute',
            right: 0,
            top: 0,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
            maxHeight: height * maxHeightRatio,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
            ...theme.shadow.raised,
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: theme.spacing.sm }}>
            <View
              style={{
                backgroundColor: theme.colors.borderStrong,
                borderRadius: theme.radius.pill,
                height: 4,
                width: 40,
              }}
            />
          </View>
          <View
            style={{
              alignItems: 'center',
              flexDirection: 'row',
              gap: theme.spacing.md,
              paddingHorizontal: theme.spacing.screen,
              paddingVertical: theme.spacing.md,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="heading">{title}</AppText>
              {subtitle ? (
                <AppText size="sm" tone="muted">
                  {subtitle}
                </AppText>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: theme.colors.surfaceSunken,
                borderRadius: theme.radius.pill,
                height: 32,
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
                width: 32,
              })}
            >
              <Icon name="close" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                gap: theme.spacing.md,
                paddingBottom: theme.spacing.md,
                paddingHorizontal: theme.spacing.screen,
              }}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={{ flexShrink: 1 }}>{children}</View>
          )}
          {footer ? (
            <View
              style={{
                borderTopColor: theme.colors.border,
                borderTopWidth: 1,
                flexDirection: 'row',
                gap: theme.spacing.sm,
                paddingHorizontal: theme.spacing.screen,
                paddingTop: theme.spacing.md,
              }}
            >
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
