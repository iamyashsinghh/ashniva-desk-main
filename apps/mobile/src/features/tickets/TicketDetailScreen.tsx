import {
  CONVERSATION_KIND,
  TICKET_ACTION,
  TICKET_STATUS_LABELS,
  VISIBILITY,
  type CommentSummary,
  type TicketDetail,
} from '@ashniva/types';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native';

import { errorMessage } from '../../shared/api/client';
import { useApiMutation } from '../../shared/api/mutations';
import { useResource } from '../../shared/api/queries';
import {
  AppText,
  Button,
  Card,
  Divider,
  Field,
  Input,
  Pill,
  Screen,
} from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { OpenConversationButton } from '../chat/OpenConversationButton';
import { TicketActions } from './TicketActions';
import { TicketCalls } from './TicketCalls';
import { ticketCan, ticketTone } from './ticket-display';

/**
 * One ticket: the thread, a reply, and the transitions worth taking from a phone.
 *
 * Replies from here are always public — the client reads them. Writing an internal note is
 * possible on the web and deliberately is not here: the difference between the two is one toggle,
 * and getting it wrong on a phone means an internal remark reaching a customer. The internal
 * discussion has its own place, which is the conversation attached to the ticket, where there is
 * no toggle to get wrong because nothing in it ever reaches a client.
 */
export function TicketDetailScreen({
  ticketId,
  onOpenChat,
}: {
  ticketId: string;
  /** Null when this person has no internal chat — a client, or a role without the permission. */
  onOpenChat: ((conversationId: string) => void) | null;
}) {
  const theme = useTheme();
  const [reply, setReply] = useState('');
  const query = useResource<TicketDetail>(['tickets', ticketId], `/tickets/${ticketId}`);
  const ticket = query.data ?? null;
  const refresh = () => void query.refetch();

  const send = useApiMutation<{ body: string }, CommentSummary>({
    path: `/tickets/${ticketId}/comments`,
    // Always the client-visible kind. See the note at the top of this file.
    body: ({ body }) => ({ body, visibility: VISIBILITY.CLIENT }),
    invalidate: [['tickets', ticketId], ['tickets']],
    onSuccess: () => setReply(''),
  });

  if (!ticket && query.error) {
    return (
      <Screen>
        <ErrorState
          message={errorMessage(query.error)}
          offline={query.error instanceof Error && query.error.name === 'NetworkError'}
          onRetry={refresh}
        />
      </Screen>
    );
  }
  if (!ticket) {
    return (
      <Screen>
        <LoadingState label="Loading the ticket" />
      </Screen>
    );
  }

  const canReply = ticketCan(ticket.actions, TICKET_ACTION.REPLY_PUBLIC);

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ gap: theme.spacing.md, padding: theme.spacing.lg }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Card>
            <AppText size="xs" tone="faint">
              {ticket.key} · {ticket.priority} · raised by {ticket.requester.name}
            </AppText>
            <AppText size="lg" weight="bold">
              {ticket.title}
            </AppText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketTone(ticket.status)} />
              {ticket.sla?.overall === 'BREACHED' ? (
                <Pill label="SLA breached" tone="danger" />
              ) : null}
            </View>
          </Card>

          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              What was reported
            </AppText>
            <AppText>{ticket.description}</AppText>
            {ticket.impact ? (
              <>
                <Divider />
                <AppText size="sm" tone="muted" weight="medium">
                  Impact
                </AppText>
                <AppText>{ticket.impact}</AppText>
              </>
            ) : null}
          </Card>

          {ticket.resolution ? (
            <Card>
              <AppText size="sm" tone="muted" weight="medium">
                How it was resolved
              </AppText>
              <AppText>{ticket.resolution}</AppText>
            </Card>
          ) : null}

          <Card>
            <AppText size="sm" tone="muted" weight="medium">
              Conversation ({ticket.comments.length})
            </AppText>
            {ticket.comments.length === 0 ? (
              <AppText tone="muted">Nothing yet.</AppText>
            ) : (
              ticket.comments.map((comment) => (
                <View key={comment.id} style={{ gap: theme.spacing.xs }}>
                  <Divider />
                  <AppText size="xs" tone="faint">
                    {comment.author.name}
                    {comment.visibility === VISIBILITY.INTERNAL ? ' · internal note' : ''}
                  </AppText>
                  <AppText size="sm">{comment.body}</AppText>
                </View>
              ))
            )}
          </Card>

          {canReply ? (
            <Card>
              <Field label="Reply" hint="The client reads this.">
                <Input
                  accessibilityLabel="Your reply"
                  multiline
                  numberOfLines={3}
                  onChangeText={setReply}
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                  value={reply}
                />
              </Field>
              {send.error ? (
                <AppText tone="danger" size="sm">
                  {send.error}
                </AppText>
              ) : null}
              <Button
                label="Send reply"
                loading={send.busy}
                disabled={reply.trim().length < 2}
                accessibilityHint="Posts your reply where the client can read it"
                onPress={() => void send.run({ body: reply.trim() })}
              />
            </Card>
          ) : null}

          <TicketActions ticket={ticket} onChanged={refresh} />

          <TicketCalls ticketId={ticket.id} />

          {onOpenChat ? (
            <OpenConversationButton
              anchor={{ kind: CONVERSATION_KIND.TICKET, ticketId: ticket.id }}
              label="Internal discussion"
              hint="Opens the internal conversation about this ticket. The client never sees it."
              onOpened={onOpenChat}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
