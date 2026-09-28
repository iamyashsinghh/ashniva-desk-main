import {
  CONVERSATION_KIND,
  CONVERSATION_KIND_LABELS,
  type ConversationDetail,
} from '@ashniva/types';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner } from '../../shared/components/feedback';
import { Glyph } from '../../shared/components/glyph';
import { AppText } from '../../shared/components/primitives';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { Avatar } from './Avatar';
import { conversationLabel } from './conversation-filters';

/** The title bar: who or what this is, and the one place a group's own screen is reached from. */
export function ConversationHeader({
  conversation,
  onOpenGroup,
}: {
  conversation: ConversationDetail;
  onOpenGroup?: () => void;
}) {
  const theme = useTheme();
  const name = conversationLabel(conversation);

  const row = (
    <View
      style={{
        alignItems: 'center',
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
      }}
    >
      <Avatar
        name={name}
        size={36}
        shape={conversation.kind === CONVERSATION_KIND.GROUP ? 'group' : 'person'}
        cutColor={theme.colors.surface}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <AppText variant="heading" numberOfLines={1}>
          {name}
        </AppText>
        <AppText size="xs" tone="muted" numberOfLines={1}>
          {conversation.project ? `${conversation.project.code} · ` : ''}
          {CONVERSATION_KIND_LABELS[conversation.kind]}
          {onOpenGroup ? ` · ${conversation.participants.length} people` : ''}
        </AppText>
      </View>
      {onOpenGroup ? <Glyph name="chevron-right" color={theme.colors.textFaint} size={12} /> : null}
    </View>
  );

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: theme.colors.border,
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.screen,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {onOpenGroup ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}, group and members`}
          accessibilityHint="Who is in this group, and what it is called"
          onPress={onOpenGroup}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {row}
        </Pressable>
      ) : (
        row
      )}
      {conversation.abilities.viaOversight ? (
        <Banner tone="warning">
          You are reading this on oversight. Every view is recorded in the audit log.
        </Banner>
      ) : null}
    </View>
  );
}
