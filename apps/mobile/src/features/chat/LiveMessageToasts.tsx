import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glyph } from '../../shared/components/glyph';
import { AppText, cardStyle } from '../../shared/components/primitives';
import { formatTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { Avatar } from './Avatar';
import { useLiveMessageToasts, type LiveMessageToast } from './live-toasts';

/**
 * Arriving messages, as cards along the top of the screen.
 *
 * Mount once, above the navigator, so a card survives moving between screens. Tapping a card opens
 * the conversation through `onOpenConversation`; the navigator decides where that is. Everything
 * about whether a card may be shown lives in `useLiveMessageToasts`.
 */
export function LiveMessageToasts({
  onOpenConversation,
}: {
  onOpenConversation: (conversationId: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { toasts, dismiss } = useLiveMessageToasts();

  const newest = toasts.at(-1);
  useEffect(() => {
    if (newest) {
      AccessibilityInfo.announceForAccessibility(
        `New message from ${newest.from}${newest.isMention ? ', mentions you' : ''}: ${newest.preview}`,
      );
    }
  }, [newest]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      accessibilityLabel="New messages"
      style={{
        gap: theme.spacing.sm,
        left: 0,
        position: 'absolute',
        right: 0,
        top: 0,
        paddingHorizontal: theme.spacing.md,
        paddingTop: insets.top + theme.spacing.xs,
      }}
    >
      {toasts.map((toast) => (
        <ToastCard
          key={toast.key}
          toast={toast}
          onOpen={() => {
            dismiss(toast.key);
            onOpenConversation(toast.conversationId);
          }}
          onDismiss={() => dismiss(toast.key)}
        />
      ))}
    </View>
  );
}

function ToastCard({
  toast,
  onOpen,
  onDismiss,
}: {
  toast: LiveMessageToast;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        cardStyle(theme, false),
        { ...theme.shadow.raised, alignItems: 'center', flexDirection: 'row' },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${toast.from}${toast.isMention ? ', mentioned you' : ''}: ${toast.preview}`}
        accessibilityHint="Opens the conversation"
        onPress={onOpen}
        style={({ pressed }) => ({
          alignItems: 'center',
          flex: 1,
          flexDirection: 'row',
          gap: theme.spacing.md,
          opacity: pressed ? 0.7 : 1,
          padding: theme.spacing.md,
        })}
      >
        <Avatar name={toast.from} size={36} shape="person" cutColor={theme.colors.surface} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs }}>
            <AppText weight="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {toast.from}
            </AppText>
            {/* The unread mark: nothing here moves a read cursor, so it is unread by definition. */}
            <View
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: 4,
                height: 8,
                width: 8,
              }}
            />
            <AppText size="xs" tone="faint">
              {formatTime(toast.at) ?? ''}
            </AppText>
          </View>
          {toast.isMention || toast.context ? (
            <AppText size="xs" tone={toast.isMention ? 'primary' : 'faint'} weight="medium">
              {[toast.isMention ? 'Mentioned you' : null, toast.context]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          ) : null}
          <AppText size="sm" tone="muted" numberOfLines={2}>
            {toast.preview}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Dismiss the message from ${toast.from}`}
        onPress={onDismiss}
        style={({ pressed }) => ({
          alignItems: 'center',
          alignSelf: 'stretch',
          justifyContent: 'center',
          minWidth: TOUCH_TARGET,
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <Glyph name="close" color={theme.colors.textMuted} size={11} />
      </Pressable>
    </View>
  );
}
