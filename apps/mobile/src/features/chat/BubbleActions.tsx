import type { MessageSummary } from '@ashniva/types';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { Icon, type IconName } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { useMessageRevisions } from './chat-api';

/**
 * What can be done to one message, under its bubble.
 *
 * Outside the bubble rather than inside it: the bubble is one `accessible` element read as one
 * sentence, and a control inside one of those is a control a screen reader cannot reach.
 *
 * Every control is drawn from something the server said. Edit from `message.canEdit`; Earlier
 * versions only on oversight, where the screen passes `onShowRevisions`. Reply is not here: on a
 * phone it is a swipe or a long press on the bubble, so a busy thread is not a column of "Reply"
 * links under every line — see `SwipeToReply` and `MessageActionSheet`.
 */
export function BubbleActions({
  message,
  onEdit,
  onShowRevisions,
  revisionsOpen,
}: {
  message: MessageSummary;
  onEdit: (messageId: string) => void;
  onShowRevisions: ((messageId: string) => void) | undefined;
  revisionsOpen: boolean;
}) {
  const theme = useTheme();
  if (message.deletedAt) {
    return null;
  }
  const canRevisions = Boolean(onShowRevisions) && message.editedAt !== null && !revisionsOpen;
  if (!message.canEdit && !canRevisions) {
    return null;
  }

  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
      {message.canEdit ? (
        <Action
          icon="pencil"
          label="Edit"
          accessibilityLabel="Edit this message"
          accessibilityHint="Rewrites what this message says. What it said before is kept."
          onPress={() => onEdit(message.id)}
        />
      ) : null}
      {canRevisions ? (
        <Action
          icon="time-outline"
          label="Earlier versions"
          accessibilityLabel="Earlier versions of this message"
          accessibilityHint="Shows what it said before it was edited. The view is audited."
          onPress={() => onShowRevisions?.(message.id)}
        />
      ) : null}
    </View>
  );
}

function Action({
  icon,
  label,
  accessibilityLabel,
  accessibilityHint,
  onPress,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      // Small to look at, full size to hit: the slop makes up the 44 points.
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        flexDirection: 'row',
        gap: 4,
        justifyContent: 'center',
        minHeight: TOUCH_TARGET - 16,
        opacity: pressed ? 0.6 : 1,
        paddingHorizontal: theme.spacing.sm,
      })}
    >
      <Icon name={icon} size={11} color={theme.colors.primary} />
      <AppText size="xs" weight="medium" tone="primary">
        {label}
      </AppText>
    </Pressable>
  );
}

/** What an edited message said before, oldest edit last, fetched when somebody asked. */
export function MessageRevisions({ message }: { message: MessageSummary }) {
  const theme = useTheme();
  const revisions = useMessageRevisions(message.conversationId, message.id, true);

  let content: ReactNode;
  if (revisions.isLoading) {
    content = (
      <AppText size="xs" tone="muted">
        Loading earlier versions…
      </AppText>
    );
  } else if (revisions.error) {
    content = (
      <AppText size="xs" tone="danger">
        {errorMessage(revisions.error)}
      </AppText>
    );
  } else if ((revisions.data ?? []).length === 0) {
    content = (
      <AppText size="xs" tone="muted">
        No earlier version was recorded.
      </AppText>
    );
  } else {
    content = (revisions.data ?? []).map((revision) => (
      <AppText key={revision.id} size="xs" tone="muted">
        {formatDateTime(revision.createdAt) ?? ''} · {revision.body}
      </AppText>
    ));
  }

  return (
    <View
      style={{
        borderColor: theme.colors.border,
        borderLeftWidth: 2,
        gap: 2,
        marginHorizontal: theme.spacing.md,
        paddingLeft: theme.spacing.sm,
      }}
    >
      {content}
    </View>
  );
}
