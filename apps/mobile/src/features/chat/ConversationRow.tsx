import {
  CONVERSATION_KIND_LABELS,
  type ConversationSummary,
  type MessagingScopeContact,
} from '@ashniva/types';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '../../shared/components/Icon';
import { PersonAvatar } from '../../shared/components/PersonAvatar';
import { AppText } from '../../shared/components/primitives';
import { formatSince } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ConversationAvatar } from './ConversationAvatar';
import {
  CONVERSATION_KIND_ICONS,
  contextLabelOf,
  conversationLabel,
  unreadBadge,
} from './conversation-filters';

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

/** The avatar's width, which the separator between rows is inset by so it lines up with the text. */
export const AVATAR_SIZE = 44;

export const ConversationRow = memo(function ConversationRow({
  row,
  mentioned,
  onOpen,
}: ConversationRowProps) {
  const theme = useTheme();
  const unread = row.unreadCount > 0;
  const name = conversationLabel(row);
  const context = contextLabelOf(row);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabelFor(name, row.unreadCount, mentioned)}
      accessibilityHint="Opens the conversation"
      onPress={() => onOpen(row.id)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.background,
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
        paddingHorizontal: theme.spacing.screen,
        paddingVertical: theme.spacing.md,
      })}
    >
      <ConversationAvatar
        conversation={row}
        size={AVATAR_SIZE}
        // The tile's cut corner shows the row behind it, which is the screen, not a card.
        cutColor={theme.colors.background}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ alignItems: 'baseline', flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText weight={unread ? 'bold' : 'medium'} numberOfLines={1}>
              {name}
            </AppText>
          </View>
          <AppText
            size="xs"
            tone={unread ? 'primary' : 'faint'}
            weight={unread ? 'medium' : undefined}
          >
            {formatSince(row.lastMessageAt) ?? ''}
          </AppText>
        </View>
        <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
          <Icon name={CONVERSATION_KIND_ICONS[row.kind]} size={12} color={theme.colors.textFaint} />
          <AppText size="xs" tone="faint" numberOfLines={1} style={{ flexShrink: 1 }}>
            {context ? `${context} · ` : ''}
            {CONVERSATION_KIND_LABELS[row.kind]}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-start', flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            {row.lastMessagePreview ? (
              <AppText size="sm" tone={unread ? 'default' : 'muted'} numberOfLines={2}>
                {row.lastMessagePreview}
              </AppText>
            ) : (
              <AppText size="sm" tone="faint">
                Nothing said yet.
              </AppText>
            )}
          </View>
          {/* The badges carry no label of their own: the row is one accessible element with
              one sentence — `Pressable` collapses its children — so a screen reader hears the
              count once rather than three times. */}
          {mentioned || unread ? (
            <View style={{ alignItems: 'flex-end', gap: theme.spacing.xs }}>
              {mentioned ? <Badge label="@ you" prominent /> : null}
              {unread ? (
                <Badge label={`${unreadBadge(row.unreadCount)} unread`} prominent={!mentioned} />
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

/**
 * Somebody this person may message and has no thread with yet.
 *
 * Opening one starts the direct message, so the row says why they are reachable — the directory's
 * own reason — rather than a preview there is not.
 */
export const PersonRow = memo(function PersonRow({
  contact,
  opening,
  onOpen,
}: {
  contact: MessagingScopeContact;
  opening: boolean;
  onOpen: (contact: MessagingScopeContact) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${contact.name}, ${contact.reason}`}
      accessibilityHint="Starts a direct message"
      accessibilityState={{ busy: opening, disabled: opening }}
      disabled={opening}
      onPress={() => onOpen(contact)}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.background,
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET,
        opacity: opening ? 0.6 : 1,
        paddingHorizontal: theme.spacing.screen,
        paddingVertical: theme.spacing.md,
      })}
    >
      <PersonAvatar person={contact} size={AVATAR_SIZE} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText weight="medium" numberOfLines={1}>
          {contact.name}
        </AppText>
        <AppText size="sm" tone="muted" numberOfLines={1}>
          {opening ? 'Opening…' : contact.reason}
        </AppText>
      </View>
      <Icon name="chatbubble-outline" size={18} color={theme.colors.textFaint} />
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
        alignSelf: 'flex-end',
        backgroundColor: prominent ? theme.colors.primary : theme.colors.pillBackground,
        borderRadius: theme.radius.pill,
        minWidth: 22,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 2,
      }}
    >
      <AppText size="xs" weight="bold" tabular tone={prominent ? 'inverse' : 'muted'}>
        {label}
      </AppText>
    </View>
  );
}
