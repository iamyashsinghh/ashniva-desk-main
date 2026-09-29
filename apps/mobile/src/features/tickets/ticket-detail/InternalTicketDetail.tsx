import {
  CONVERSATION_KIND,
  PERMISSIONS,
  TICKET_ACTION,
  TICKET_TYPE_LABELS,
  type TicketDetail,
} from '@ashniva/types';
import { View } from 'react-native';

import { errorMessage } from '../../../shared/api/client';
import { useResource } from '../../../shared/api/queries';
import { KeyValueRow } from '../../../shared/components/data-display';
import { Section, SectionHeader } from '../../../shared/components/layout';
import { AppText, Divider, Screen } from '../../../shared/components/primitives';
import { ErrorState, LoadingState } from '../../../shared/components/states';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { useSession } from '../../auth/SessionProvider';
import { OpenConversationButton } from '../../chat/OpenConversationButton';
import { TicketCalls } from '../TicketCalls';
import { ticketCan } from '../ticket-display';
import { DetailScroll } from './DetailScroll';
import { TicketActions } from './TicketActions';
import { TicketActivity } from './TicketActivity';
import { TicketFiles } from './TicketFiles';
import { TicketHero } from './TicketHero';
import { TicketLinkedTasks } from './TicketLinkedTasks';
import { TicketRelations } from './TicketRelations';
import { TicketRoutingCard } from './TicketRoutingCard';
import { TicketSimilar } from './TicketSimilar';
import { TicketSlaCard } from './TicketSlaCard';
import { TicketThread } from './TicketThread';

export interface InternalTicketDetailProps {
  ticketId: string;
  onOpenChat: ((conversationId: string) => void) | null;
  onOpenTask?: (taskId: string) => void;
  onOpenTicket?: (ticketId: string) => void;
}

/**
 * The staff view of a ticket, laid out in the order people act on it: what can be done, how the
 * clock stands and who owns it, what was reported, the conversation, then the supporting record.
 */
export function InternalTicketDetail({
  ticketId,
  onOpenChat,
  onOpenTask,
  onOpenTicket,
}: InternalTicketDetailProps) {
  const { can } = useSession();
  const query = useResource<TicketDetail>(['tickets', ticketId], `/tickets/${ticketId}`);
  const ticket = query.data ?? null;
  const refresh = () => void query.refetch();

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

  return (
    <DetailScroll refreshing={query.isRefetching} onRefresh={refresh}>
      <TicketHero ticket={ticket} />
      <TicketActions ticket={ticket} onChanged={refresh} />
      <TicketSlaCard ticketId={ticket.id} sla={ticket.sla} />
      <TicketRoutingCard ticket={ticket} />
      <ReportedCard ticket={ticket} />
      <TicketThread ticket={ticket} />
      <TicketLinkedTasks ticket={ticket} {...(onOpenTask ? { onOpenTask } : {})} />
      <TicketFiles
        ticketId={ticket.id}
        files={ticket.files}
        canUpload={ticketCan(ticket.actions, TICKET_ACTION.REPLY_PUBLIC)}
        chooseVisibility={can(PERMISSIONS.COMMENT_INTERNAL)}
        onUploaded={refresh}
      />
      <TicketSimilar ticketId={ticket.id} {...(onOpenTicket ? { onOpenTicket } : {})} />
      <TicketRelations ticketId={ticket.id} {...(onOpenTicket ? { onOpenTicket } : {})} />
      <TicketCalls ticketId={ticket.id} />
      {onOpenChat ? (
        <Section title="Team only" icon="lock-closed-outline">
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
      <TicketActivity history={ticket.history} />
    </DetailScroll>
  );
}

function ReportedCard({ ticket }: { ticket: TicketDetail }) {
  const theme = useTheme();
  return (
    <Section title="What was reported" icon="document-text-outline">
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
      <Divider />
      <KeyValueRow label="Category" value={TICKET_TYPE_LABELS[ticket.type]} />
      {ticket.module ? <KeyValueRow label="Affected area" value={ticket.module} /> : null}
      {ticket.productVersion ? <KeyValueRow label="Version" value={ticket.productVersion} /> : null}
      <KeyValueRow label="Company" value={ticket.clientOrganization.name} />
    </Section>
  );
}
