import { CONVERSATION_KIND_LABELS, type ConversationSummary } from '@ashniva/types';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Card } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { Avatar } from './Avatar';
import { conversationLabel } from './conversation-filters';

/**
 * One conversation in the list.
 *
 * `memo`, and every prop it takes is a primitive or a stable callback, so scrolling a hundred rows
 * re-renders none of them. The screen passes `onOpen` as a member of the row rather than an inline
 * arrow for the same reason: an arrow rebuilt on every render defeats the memo and makes the list
 * rebuild every visible row on each poll.
 */
export interface ConversationRowProps {
  row: ConversationSummary;
  /** True when an unread mention of the reader is waiting in this conversation. */
  mentioned: boolean;
  onOpen: (conversationId: string) => void;
}

export const ConversationRow = memo(function ConversationRow({
  row,
  mentioned,
  onOpen,
}: ConversationRowProps) {
  const theme = useTheme();
  const unread = row.unreadCount > 0;
  const name = conversationLabel(row);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(name, row.unreadCount, mentioned)}
      accessibilityHint="Opens the conversation"
      onPress={() => onOpen(row.id)}
      style={({ pressed }) => ({ minHeight: TOUCH_TARGET, opacity: pressed ? 0.7 : 1 })}
    >
      <Card style={unread ? { borderColor: theme.colors.primary } : undefined}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
          <Avatar name={name} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
              <View style={{ flex: 1 }}>
                <AppText weight={unread ? 'bold' : 'medium'} numberOfLines={1}>
                  {name}
                </AppText>
              </View>
              <AppText size="xs" tone="faint">
                {formatSince(row.lastMessageAt) ?? ''}
              </AppText>
            </View>
            <AppText size="xs" tone="faint" numberOfLines={1}>
              {row.project ? `${row.project.code} · ` : ''}
              {CONVERSATION_KIND_LABELS[row.kind]}
            </AppText>
            {row.lastMessagePreview ? (
              <AppText size="sm" tone="muted" numberOfLines={2}>
                {row.lastMessagePreview}
              </AppText>
            ) : (
              <AppText size="sm" tone="faint">
                Nothing said yet.
              </AppText>
            )}
            {/* The badges carry no label of their own: the row is one accessible element with
                one sentence — `Pressable` collapses its children — so a screen reader hears the
                count once rather than three times. */}
            <View style={{ alignItems: 'center', flexDirection: 'row', gap: theme.spacing.sm }}>
              {mentioned ? <Badge label="@ you" prominent /> : null}
              {unread ? <Badge label={`${row.unreadCount} unread`} prominent={!mentioned} /> : null}
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
});

/** What a screen reader hears instead of the badges. */
function accessibilityLabelFor(name: string, unreadCount: number, mentioned: boolean): string {
  const parts = [name];
  if (mentioned) {
    parts.push('mentions you');
  }
  if (unreadCount > 0) {
    parts.push(`${unreadCount} unread`);
  }
  return parts.join(', ');
}

function Badge({ label, prominent }: { label: string; prominent: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: prominent ? theme.colors.primary : theme.colors.pillBackground,
        borderRadius: theme.radius.pill,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
      }}
    >
      <AppText size="xs" weight="medium" tone={prominent ? 'inverse' : 'muted'}>
        {label}
      </AppText>
    </View>
  );
}
