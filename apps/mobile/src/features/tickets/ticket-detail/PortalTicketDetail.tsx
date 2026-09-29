import {
  CLIENT_VISIBLE_STATUS_LABELS,
  PRIORITY_LABELS,
  SLA_TARGET_STATUS,
  TICKET_TYPE_LABELS,
  type CommentSummary,
  type PortalTicketDetail as PortalTicket,
} from '@ashniva/types';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { useApiMutation } from '../../../shared/api/mutations';
import { useResource } from '../../../shared/api/queries';
import { KeyValueRow, MetaLine } from '../../../shared/components/data-display';
import { Banner } from '../../../shared/components/feedback';
import { Hero, Section, SectionHeader } from '../../../shared/components/layout';
import { AppText, Divider, Pill, PillRow, Screen } from '../../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { formatDateTime, formatSince } from '../../../shared/format/format';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { TicketMessages, TicketReplyComposer } from '../TicketConversation';
import { clientTicketTone, portalTicketMark } from '../ticket-display';
import { DetailScroll } from './DetailScroll';
import { PortalTicketActions } from './PortalTicketActions';
import { TicketFiles } from './TicketFiles';
import { SlaTargetRow } from './TicketSlaCard';

/**
 * A client's own ticket, read from the portal endpoint.
 *
 * That endpoint is the whole of the privacy story: it returns the client-visible status, the
 * public replies and the resolution target, and nothing else exists in the response to leak — no
 * internal notes, no assignee, no first-response internals.
 */
export function PortalTicketDetail({ ticketId }: { ticketId: string }) {
  const theme = useTheme();
  const [reply, setReply] = useState('');
  const query = useResource<PortalTicket>(
    ['tickets', 'portal', ticketId],
    `/portal/tickets/${ticketId}`,
  );
  const ticket = query.data ?? null;
  const refresh = () => void query.refetch();

  const send = useApiMutation<{ body: string }, CommentSummary>({
    path: `/portal/tickets/${ticketId}/reply`,
    body: (variables) => variables,
    invalidate: [['tickets'], ['portal']],
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

  const resolution = ticket.sla?.resolution;
  const mark = portalTicketMark(ticket.status, resolution?.status === SLA_TARGET_STATUS.BREACHED);

  return (
    <DetailScroll refreshing={query.isRefetching} onRefresh={refresh}>
      <Hero
        overline={`${ticket.key} · ${PRIORITY_LABELS[ticket.priority]} · ${TICKET_TYPE_LABELS[ticket.type]}`}
        title={ticket.title}
        icon={mark.icon}
        iconTone={mark.tone}
      >
        <PillRow>
          <Pill
            label={CLIENT_VISIBLE_STATUS_LABELS[ticket.status]}
            tone={clientTicketTone(ticket.status)}
          />
          {ticket.needsYourAction ? <Pill label="Needs you" tone="warning" /> : null}
        </PillRow>
        <View style={{ gap: 4 }}>
          {ticket.project ? (
            <MetaLine icon="folder-open-outline">{ticket.project.name}</MetaLine>
          ) : null}
          <MetaLine icon="time-outline">
            Raised {formatSince(ticket.createdAt)} by {ticket.requester.name}
          </MetaLine>
        </View>
      </Hero>

      {ticket.needsYourAction && !ticket.canClose ? (
        <Banner tone="warning">The team is waiting for your answer below.</Banner>
      ) : null}

      <PortalTicketActions ticket={ticket} onChanged={refresh} />

      {resolution ? (
        <Section title="Resolution target" icon="speedometer-outline">
          <SlaTargetRow label="Resolution" target={resolution} />
          {ticket.sla?.isPaused ? (
            <MetaLine icon="pause-circle-outline">
              The clock is paused while the team waits for you.
            </MetaLine>
          ) : null}
        </Section>
      ) : null}

      <Section title="What you reported" icon="document-text-outline">
        <AppText>{ticket.description}</AppText>
        {ticket.impact ? (
          <>
            <Divider />
            <View style={{ gap: theme.spacing.xs }}>
              <SectionHeader title="Impact" icon="pulse-outline" />
              <AppText>{ticket.impact}</AppText>
            </View>
          </>
        ) : null}
        {ticket.resolution ? (
          <>
            <Divider />
            <View style={{ gap: theme.spacing.xs }}>
              <SectionHeader title="How it was resolved" icon="checkmark-circle-outline" />
              <AppText>{ticket.resolution}</AppText>
            </View>
          </>
        ) : null}
      </Section>

      <Section title="Replies" count={ticket.replies.length} icon="chatbubbles-outline">
        <TicketMessages comments={ticket.replies} emptyText="No replies yet." />
        {ticket.canReply ? (
          <TicketReplyComposer
            value={reply}
            onChange={setReply}
            busy={send.busy}
            error={send.error}
            audienceHint="The support team reads this."
            onSend={() => void send.run({ body: reply.trim() })}
          />
        ) : null}
      </Section>

      <TicketFiles
        ticketId={ticket.id}
        files={ticket.files}
        canUpload={ticket.canReply}
        chooseVisibility={false}
        onUploaded={refresh}
      />

      <Section title="Details" icon="list-outline">
        <KeyValueRow label="Category" value={TICKET_TYPE_LABELS[ticket.type]} />
        <KeyValueRow label="Priority" value={PRIORITY_LABELS[ticket.priority]} />
        <KeyValueRow label="Raised" value={formatDateTime(ticket.createdAt) ?? '—'} />
        {ticket.resolvedAt ? (
          <KeyValueRow label="Resolved" value={formatDateTime(ticket.resolvedAt) ?? '—'} />
        ) : null}
      </Section>
    </DetailScroll>
  );
}
