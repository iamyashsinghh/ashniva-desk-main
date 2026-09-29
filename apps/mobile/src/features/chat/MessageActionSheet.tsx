import type { MessageSummary } from '@ashniva/types';
import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '../../shared/components/Icon';
import { AppText } from '../../shared/components/primitives';
import { Sheet } from '../../shared/components/Sheet';
import { formatDateTime } from '../../shared/format/format';
import { TOUCH_TARGET } from '../../shared/theme/theme';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { messageSnippet } from './message-labels';

/**
 * What a long press on a message offers.
 *
 * Reply, Edit and Earlier versions, each only where the server said so: Reply where the reader may
 * post, Edit from `canEdit`, history on oversight. There is no delete and no reactions, because the
 * web has neither and the API refuses delete to everyone without `conversation:inspect`.
 */
export interface MessageActions {
  onReply?: ((message: MessageSummary) => void) | undefined;
  onEdit: (messageId: string) => void;
  onShowRevisions?: ((messageId: string) => void) | undefined;
}

/**
 * Whether a line can be answered. One's own included, as on every phone chat: a reply is a quote
 * carried by `replyToId`, not a tag of the sender. A withdrawn original is refused by the server
 * (409), and a system line has nobody to answer.
 */
export function canReplyTo(message: MessageSummary, actions: Pick<MessageActions, 'onReply'>) {
  return Boolean(actions.onReply) && !message.deletedAt && message.systemKind === null;
}

export function MessageActionSheet({
  message,
  isOwn,
  names,
  actions,
  onClose,
}: {
  message: MessageSummary | null;
  isOwn: boolean;
  names: ReadonlyMap<string, string>;
  actions: MessageActions;
  onClose: () => void;
}) {
  const theme = useTheme();
  if (!message) {
    return null;
  }
  const who = isOwn ? 'You' : (message.sender?.name ?? 'Somebody');
  const then = (run: () => void) => () => {
    onClose();
    run();
  };

  return (
    <Sheet
      visible
      title="Message"
      subtitle={`${who} · ${formatDateTime(message.createdAt) ?? ''}`}
      onClose={onClose}
    >
      <View
        style={{
          backgroundColor: theme.colors.surfaceSunken,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        }}
      >
        <AppText size="sm" tone="muted" numberOfLines={4}>
          {messageSnippet(message, names)}
        </AppText>
      </View>
      <View style={{ gap: 2 }}>
        {canReplyTo(message, actions) ? (
          <ActionRow
            icon="arrow-undo-outline"
            label="Reply"
            hint="Quotes this message above your answer"
            onPress={then(() => actions.onReply?.(message))}
          />
        ) : null}
        {message.canEdit && !message.deletedAt ? (
          <ActionRow
            icon="pencil"
            label="Edit"
            hint="Rewrites what this message says. What it said before is kept."
            onPress={then(() => actions.onEdit(message.id))}
          />
        ) : null}
        {actions.onShowRevisions && message.editedAt ? (
          <ActionRow
            icon="time-outline"
            label="Earlier versions"
            hint="Shows what it said before it was edited. The view is audited."
            onPress={then(() => actions.onShowRevisions?.(message.id))}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

export function ActionRow({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? theme.colors.surfaceSunken : 'transparent',
        borderRadius: theme.radius.md,
        flexDirection: 'row',
        gap: theme.spacing.md,
        minHeight: TOUCH_TARGET + 4,
        paddingHorizontal: theme.spacing.sm,
      })}
    >
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <AppText weight="medium">{label}</AppText>
    </Pressable>
  );
}
