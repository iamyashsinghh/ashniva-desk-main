import { VISIBILITY, type CommentSummary } from '@ashniva/types';
import { View } from 'react-native';

import { Avatar } from '../../shared/components/Avatar';
import { Banner } from '../../shared/components/feedback';
import { Icon } from '../../shared/components/Icon';
import { AppText, Button, Field, Input } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A ticket's thread, as messages rather than a table.
 *
 * An internal note is tinted and labelled, not only coloured: the one thing a reader of this
 * thread must never get wrong is which lines the client has seen.
 */
export function TicketMessages({
  comments,
  emptyText = 'Nothing yet.',
}: {
  comments: readonly CommentSummary[];
  emptyText?: string;
}) {
  const theme = useTheme();
  if (comments.length === 0) {
    return <AppText tone="muted">{emptyText}</AppText>;
  }
  return (
    <View style={{ gap: theme.spacing.md }}>
      {comments.map((comment) => {
        const internal = comment.visibility === VISIBILITY.INTERNAL;
        return (
          <View key={comment.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Avatar name={comment.author.name} size={28} />
            <View
              style={{
                backgroundColor: internal ? theme.colors.warningSoft : theme.colors.surfaceSunken,
                borderRadius: theme.radius.md,
                borderTopLeftRadius: theme.radius.xs,
                flex: 1,
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
              }}
            >
              <View style={{ alignItems: 'center', flexDirection: 'row', gap: 4 }}>
                {internal ? (
                  <Icon name="lock-closed" size={11} color={theme.colors.warning} />
                ) : null}
                <AppText size="xs" tone="faint" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {comment.author.name}
                  {internal ? ' · internal note' : ''}
                  {comment.createdAt ? ` · ${formatDateTime(comment.createdAt)}` : ''}
                </AppText>
              </View>
              <AppText size="sm">{comment.body}</AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The reply box.
 *
 * In internal mode the whole box turns the internal-note colour and every word on it says the
 * client will not see it — the field label, the hint and the button — so the mode is never carried
 * by one small toggle alone.
 */
export function TicketReplyComposer({
  value,
  onChange,
  busy,
  error,
  onSend,
  internal = false,
  disabledReason,
  audienceHint = 'The client reads this.',
}: {
  value: string;
  onChange: (text: string) => void;
  busy: boolean;
  error: string | null;
  onSend: () => void;
  internal?: boolean;
  /** Why the API will not take this kind of message right now; disables the send button. */
  disabledReason?: string | null;
  audienceHint?: string;
}) {
  const theme = useTheme();
  const label = internal ? 'Internal note' : 'Reply';
  return (
    <View
      style={{
        backgroundColor: internal ? theme.colors.warningSoft : theme.colors.surfaceSunken,
        borderRadius: theme.radius.md,
        gap: theme.spacing.sm,
        padding: theme.spacing.md,
      }}
    >
      <Field
        label={label}
        hint={internal ? 'Only the team sees this. The client never does.' : audienceHint}
      >
        <Input
          accessibilityLabel={internal ? 'Your internal note' : 'Your reply'}
          multiline
          numberOfLines={3}
          onChangeText={onChange}
          placeholder={internal ? 'Note for the team…' : 'Write a reply…'}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
          value={value}
        />
      </Field>
      {disabledReason ? (
        <AppText size="xs" tone="muted">
          {disabledReason}
        </AppText>
      ) : null}
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <View style={{ alignItems: 'flex-end' }}>
        <Button
          label={internal ? 'Add internal note' : 'Send reply'}
          icon={internal ? 'lock-closed-outline' : 'send'}
          variant={internal ? 'secondary' : 'primary'}
          size="sm"
          loading={busy}
          disabled={Boolean(disabledReason) || value.trim().length === 0}
          accessibilityHint={
            internal ? 'Adds a note only the team can read' : 'Posts your reply on the ticket'
          }
          onPress={onSend}
        />
      </View>
    </View>
  );
}
