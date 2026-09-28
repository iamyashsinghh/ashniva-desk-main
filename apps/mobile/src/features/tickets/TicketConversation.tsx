import { VISIBILITY, type CommentSummary } from '@ashniva/types';
import { View } from 'react-native';

import { Avatar } from '../../shared/components/Avatar';
import { Banner } from '../../shared/components/feedback';
import { Section } from '../../shared/components/layout';
import { AppText, Button, Card, Field, Input } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';

/**
 * A ticket's thread, as messages rather than a table.
 *
 * An internal note is tinted and labelled, not only coloured: the one thing a reader of this
 * thread must never get wrong is which lines the client has seen.
 */
export function TicketConversation({ comments }: { comments: readonly CommentSummary[] }) {
  const theme = useTheme();
  return (
    <Section title="Conversation" count={comments.length}>
      {comments.length === 0 ? <AppText tone="muted">Nothing yet.</AppText> : null}
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
              <AppText size="xs" tone="faint" numberOfLines={1}>
                {comment.author.name}
                {internal ? ' · internal note' : ''}
                {comment.createdAt ? ` · ${formatDateTime(comment.createdAt)}` : ''}
              </AppText>
              <AppText size="sm">{comment.body}</AppText>
            </View>
          </View>
        );
      })}
    </Section>
  );
}

/** The public reply box, kept compact so it sits under the thread like a message composer. */
export function TicketReplyComposer({
  value,
  onChange,
  busy,
  error,
  onSend,
}: {
  value: string;
  onChange: (text: string) => void;
  busy: boolean;
  error: string | null;
  onSend: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <Field label="Reply" hint="The client reads this.">
        <Input
          accessibilityLabel="Your reply"
          multiline
          numberOfLines={3}
          onChangeText={onChange}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
          value={value}
        />
      </Field>
      {error ? (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      ) : null}
      <View style={{ alignItems: 'flex-end' }}>
        <Button
          label="Send reply"
          icon="arrow-up"
          size="sm"
          loading={busy}
          disabled={value.trim().length < 2}
          accessibilityHint="Posts your reply where the client can read it"
          onPress={onSend}
        />
      </View>
    </Card>
  );
}
