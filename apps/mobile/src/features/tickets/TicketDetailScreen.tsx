import {
  CONVERSATION_KIND,
  PRIORITY_LABELS,
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
  Hero,
  Section,
  SectionHeader,
  useStackKeyboardOffset,
} from '../../shared/components/layout';
import { AppText, Divider, Pill, PillRow, Screen } from '../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../shared/components/states';
import { useTheme } from '../../shared/theme/ThemeProvider';
import { OpenConversationButton } from '../chat/OpenConversationButton';
import { TicketActions } from './TicketActions';
import { TicketCalls } from './TicketCalls';
import { TicketConversation, TicketReplyComposer } from './TicketConversation';
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
  const keyboardOffset = useStackKeyboardOffset();
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
        keyboardVerticalOffset={keyboardOffset}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            gap: theme.spacing.md,
            padding: theme.spacing.screen,
            paddingBottom: theme.spacing.xxl,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <Hero
            overline={`${ticket.key} · ${PRIORITY_LABELS[ticket.priority]} · raised by ${ticket.requester.name}`}
            title={ticket.title}
          >
            <PillRow>
              <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketTone(ticket.status)} />
              {ticket.sla?.overall === 'BREACHED' ? (
                <Pill label="SLA breached" tone="danger" />
              ) : null}
            </PillRow>
          </Hero>

          <Section title="What was reported">
            <AppText>{ticket.description}</AppText>
            {ticket.impact ? (
              <>
                <Divider />
                <View style={{ gap: theme.spacing.xs }}>
                  <SectionHeader title="Impact" />
                  <AppText>{ticket.impact}</AppText>
                </View>
              </>
            ) : null}
          </Section>

          {ticket.resolution ? (
            <Section title="How it was resolved">
              <AppText>{ticket.resolution}</AppText>
            </Section>
          ) : null}

          {/* What can be done comes before the thread: it is why somebody opened this. */}
          <TicketActions ticket={ticket} onChanged={refresh} />

          <TicketConversation comments={ticket.comments} />

          {canReply ? (
            <TicketReplyComposer
              value={reply}
              onChange={setReply}
              busy={send.busy}
              error={send.error}
              onSend={() => void send.run({ body: reply.trim() })}
            />
          ) : null}

          <TicketCalls ticketId={ticket.id} />

          {onOpenChat ? (
            <Section title="Team only">
              <AppText size="xs" tone="muted">
                A conversation for the team. Nothing in it reaches the client.
              </AppText>
              <OpenConversationButton
                anchor={{ kind: CONVERSATION_KIND.TICKET, ticketId: ticket.id }}
                label="Internal discussion"
                hint="Opens the internal conversation about this ticket. The client never sees it."
                onOpened={onOpenChat}
              />
            </Section>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
