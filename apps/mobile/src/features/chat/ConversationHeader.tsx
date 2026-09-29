import type { ConversationDetail } from '@ashniva/types';
import { useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner } from '../../shared/components/feedback';
import { Icon, type IconName } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ConversationAvatar } from './ConversationAvatar';
import { CallsSheet, ConversationMenu, hasCalls } from './ConversationMenu';
import { conversationSubtitle, conversationTitle, otherPerson } from './conversation-title';

/**
 * The conversation's one top bar, in the brand's colour: back, who or what this is, calling, and
 * a menu for the rest — the shape every phone chat has taught.
 *
 * It replaces the stack header rather than sitting under it, so it takes the status bar's inset
 * itself and sets the status bar's content to the colour the tokens pair with the brand.
 */
export function ConversationHeader({
  conversation,
  viewerId,
  onBack,
  onOpenDetails,
  onSearch,
  onOpenWallpaper,
}: {
  conversation: ConversationDetail;
  viewerId: string | null;
  onBack?: (() => void) | undefined;
  /** Who is in it and what it hangs off. */
  onOpenDetails?: (() => void) | undefined;
  onSearch: () => void;
  onOpenWallpaper?: (() => void) | undefined;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [menuOpen, setMenuOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);
  const title = conversationTitle(conversation, viewerId);
  const subtitle = conversationSubtitle(conversation, viewerId);
  const onBrand = theme.colors.primaryText;
  const showCall = conversation.abilities.canCall && hasCalls(conversation);

  const identity = (
    <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
      <ConversationAvatar
        conversation={conversation}
        person={otherPerson(conversation, viewerId)}
        size={38}
        cutColor={theme.colors.primary}
      />
      <View style={{ flex: 1 }}>
        <AppText weight="bold" numberOfLines={1} style={{ color: onBrand }}>
          {title}
        </AppText>
        <AppText size="xs" numberOfLines={1} style={{ color: onBrand, opacity: 0.8 }}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );

  return (
    <View>
      {focused ? <StatusBar style={theme.isDark ? 'dark' : 'light'} /> : null}
      <View
        style={{
          alignItems: 'center',
          backgroundColor: theme.colors.primary,
          flexDirection: 'row',
          minHeight: TOUCH_TARGET + insets.top + theme.spacing.sm,
          paddingBottom: theme.spacing.xs,
          paddingRight: theme.spacing.xs,
          paddingTop: insets.top + theme.spacing.xs,
        }}
      >
        {onBack ? (
          <BarButton icon="arrow-back" label="Back" onPress={onBack} />
        ) : (
          <View style={{ width: theme.spacing.md }} />
        )}
        <View style={{ flex: 1 }}>
          {onOpenDetails ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${subtitle}`}
              accessibilityHint="Opens the conversation details"
              onPress={onOpenDetails}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              {identity}
            </Pressable>
          ) : (
            identity
          )}
        </View>
        {showCall ? (
          <BarButton icon="call-outline" label="Call" onPress={() => setCallsOpen(true)} />
        ) : null}
        <BarButton
          icon="ellipsis-vertical"
          label="More options"
          onPress={() => setMenuOpen(true)}
        />
      </View>
      {conversation.abilities.viaOversight ? (
        <View style={{ padding: theme.spacing.sm, backgroundColor: theme.colors.surface }}>
          <Banner tone="warning">
            You are reading this as an administrator. This access has been recorded.
          </Banner>
        </View>
      ) : null}

      <ConversationMenu
        conversation={conversation}
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        actions={{
          onSearch,
          onOpenWallpaper,
          onOpenDetails,
          onOpenCalls: () => setCallsOpen(true),
        }}
      />
      <CallsSheet
        conversation={conversation}
        visible={callsOpen}
        onClose={() => setCallsOpen(false)}
      />
    </View>
  );
}

/** The bar alone, for while the conversation loads or cannot be shown: never a screen with no way back. */
export function PlainConversationBar({ onBack }: { onBack?: (() => void) | undefined }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  return (
    <View
      style={{
        backgroundColor: theme.colors.primary,
        flexDirection: 'row',
        minHeight: TOUCH_TARGET + insets.top + theme.spacing.sm,
        paddingBottom: theme.spacing.xs,
        paddingTop: insets.top + theme.spacing.xs,
      }}
    >
      {focused ? <StatusBar style={theme.isDark ? 'dark' : 'light'} /> : null}
      {onBack ? <BarButton icon="arrow-back" label="Back" onPress={onBack} /> : null}
    </View>
  );
}

function BarButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        alignItems: 'center',
        height: TOUCH_TARGET,
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
        width: TOUCH_TARGET,
      })}
    >
      <Icon name={icon} size={22} color={theme.colors.primaryText} />
    </Pressable>
  );
}
