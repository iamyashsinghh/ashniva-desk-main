import { VISIBILITY, type CommentSummary, type Visibility } from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { useApiMutation } from '../../shared/api/mutations';
import { Section } from '../../shared/components/layout';
import { Segmented } from '../../shared/components/navigation-list';
import { AppText, Button, Input, Pill } from '../../shared/components/primitives';
import { formatDateTime } from '../../shared/format/format';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { ErrorNote } from '../contracts/commercial-ui';
type Mode = 'shared' | 'internal';

/** A comment changes nothing but the request itself. */
const THREAD_INVALIDATES = [['change-requests']] as const;

/**
 * The discussion with the client and, beside it, the team's internal notes — two lists rather than
 * one mixed list, as on the web, so what is about to be sent is never in doubt. The composer says
 * which audience it writes to, in words, next to the button.
 */
export function ChangeRequestThread({
  changeRequestId,
  comments,
  canReply,
}: {
  changeRequestId: string;
  comments: readonly CommentSummary[];
  canReply: boolean;
}) {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('shared');
  const [body, setBody] = useState('');
  const internal = mode === 'internal';
  const shared = comments.filter((entry) => entry.visibility === VISIBILITY.CLIENT);
  const notes = comments.filter((entry) => entry.visibility === VISIBILITY.INTERNAL);
  const messages = internal ? notes : shared;

  const send = useApiMutation<{ body: string; visibility: Visibility }, CommentSummary>({
    path: `/change-requests/${changeRequestId}/comments`,
    body: (values) => values,
    invalidate: THREAD_INVALIDATES,
    onSuccess: () => setBody(''),
  });

  return (
    <Section title={internal ? 'Internal notes' : 'Discussion'} icon="chatbubbles-outline">
      <Segmented
        label="Thread"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'shared', label: `Shared (${shared.length})` },
          { value: 'internal', label: `Internal (${notes.length})` },
        ]}
      />
      {messages.length === 0 ? (
        <AppText tone="muted">{internal ? 'No internal notes.' : 'No messages yet.'}</AppText>
      ) : (
        messages.map((entry) => (
          <View
            key={entry.id}
            style={{
              gap: theme.spacing.xs,
              padding: theme.spacing.md,
              borderRadius: theme.radius.md,
              backgroundColor: internal ? theme.colors.warningSoft : theme.colors.surfaceSunken,
            }}
          >
            <AppText size="sm" weight="medium">
              {entry.author.name}
              <AppText size="xs" tone="faint">
                {'  '}
                {formatDateTime(entry.createdAt)}
              </AppText>
            </AppText>
            <AppText>{entry.body}</AppText>
          </View>
        ))
      )}
      {canReply ? (
        <>
          <Input
            accessibilityLabel={internal ? 'Internal note' : 'Message'}
            placeholder={
              internal ? 'Note for the team (never shown to the client)…' : 'Write a message…'
            }
            multiline
            maxLength={5000}
            value={body}
            onChangeText={(text) => {
              send.reset();
              setBody(text);
            }}
            style={{ minHeight: 72 }}
          />
          <Pill
            label={
              internal ? 'Internal — the client will not see this' : 'Shared — both sides see this'
            }
            tone={internal ? 'warning' : 'success'}
          />
          <Button
            label={internal ? 'Add internal note' : 'Send'}
            icon={internal ? 'lock-closed-outline' : 'send-outline'}
            variant={internal ? 'secondary' : 'primary'}
            loading={send.busy}
            disabled={body.trim().length === 0}
            onPress={() =>
              void send.run({
                body: body.trim(),
                visibility: internal ? VISIBILITY.INTERNAL : VISIBILITY.CLIENT,
              })
            }
          />
          <ErrorNote message={send.error} />
        </>
      ) : (
        <AppText size="sm" tone="muted">
          This request is closed, so the thread is read-only.
        </AppText>
      )}
    </Section>
  );
}
