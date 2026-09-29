import {
  PRIORITY_LABELS,
  SLA_TARGET_STATUS,
  TICKET_LIST_VIEW,
  TICKET_STATUS_LABELS,
  type TicketSummary,
} from '@ashniva/types';

import { usePagedResource } from '../../../shared/api/queries';
import { MetaLine } from '../../../shared/components/data-display';
import { PressableCard } from '../../../shared/components/layout';
import { AppText, Pill, PillRow } from '../../../shared/components/primitives';
import { formatSince } from '../../../shared/format/format';
import { ticketStatusTone } from '../project-display';
import { PagedRows } from './PagedRows';

export function projectTicketsKey(projectId: string) {
  return ['tickets', 'project', projectId] as const;
}

/** Support tickets raised against this project, newest first, as the API orders them. */
export function ProjectTicketsTab({
  projectId,
  onOpenTicket,
}: {
  projectId: string;
  onOpenTicket: ((ticketId: string) => void) | null;
}) {
  const result = usePagedResource<TicketSummary>(projectTicketsKey(projectId), '/tickets', {
    view: TICKET_LIST_VIEW.ALL,
    projectId,
  });
  return (
    <PagedRows
      result={result}
      keyOf={(ticket) => ticket.id}
      renderRow={(ticket) => <ProjectTicketRow ticket={ticket} onOpen={onOpenTicket} />}
      emptyTitle="No tickets for this project"
      emptyIcon="ticket-outline"
      loadingLabel="Loading tickets"
    />
  );
}

function ProjectTicketRow({
  ticket,
  onOpen,
}: {
  ticket: TicketSummary;
  onOpen: ((ticketId: string) => void) | null;
}) {
  const breached = ticket.sla?.overall === SLA_TARGET_STATUS.BREACHED;
  return (
    <PressableCard
      accessibilityLabel={`${ticket.key} ${ticket.title}`}
      accessibilityHint="Opens the ticket"
      onPress={() => onOpen?.(ticket.id)}
      chevron={Boolean(onOpen)}
      icon="ticket-outline"
      iconTone={breached ? 'danger' : 'orange'}
    >
      <MetaLine icon="pricetag-outline">
        {ticket.key} · {PRIORITY_LABELS[ticket.priority]}
      </MetaLine>
      <AppText weight="medium" numberOfLines={2}>
        {ticket.title}
      </AppText>
      <PillRow>
        <Pill label={TICKET_STATUS_LABELS[ticket.status]} tone={ticketStatusTone(ticket.status)} />
        {breached ? <Pill label="SLA breached" tone="danger" /> : null}
      </PillRow>
      <MetaLine icon="person-outline">
        {ticket.assignedTo?.name ?? 'Unassigned'} · raised {formatSince(ticket.createdAt) ?? ''}
      </MetaLine>
    </PressableCard>
  );
}
