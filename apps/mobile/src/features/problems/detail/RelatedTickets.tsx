import {
  PERMISSIONS,
  PROBLEM_STATUS,
  PROBLEM_TICKET_RELATION_LABELS,
  TICKET_STATUS_LABELS,
  type ProblemDetail,
  type TicketStatus,
} from '@ashniva/types';
import { useState } from 'react';

import { ListRow } from '../../../shared/components/data-display';
import { Section } from '../../../shared/components/layout';
import { AppText, Button, Pill } from '../../../shared/components/primitives';
import { useSession } from '../../auth/SessionProvider';
import { ticketTone } from '../../tickets/ticket-display';
import { LinkTicketsSheet } from './LinkTicketsSheet';

function isTicketStatus(value: string): value is TicketStatus {
  return value in TICKET_STATUS_LABELS;
}

/**
 * The tickets this problem groups, each naming the client that reported it.
 *
 * That name is the whole point of the list — a support executive cannot tell three reports from
 * one without it — and it is safe because this screen is internal: each client only ever sees its
 * own ticket, and nothing maps a problem into a client response.
 */
export function RelatedTickets({
  problem,
  onOpenTicket,
}: {
  problem: ProblemDetail;
  onOpenTicket?: (ticketId: string) => void;
}) {
  const { can } = useSession();
  const [linking, setLinking] = useState(false);
  // Linking picks from `GET /tickets`, which needs `ticket:read` on top of `problem:manage`.
  const canLink =
    can(PERMISSIONS.PROBLEM_MANAGE) &&
    can(PERMISSIONS.TICKET_READ) &&
    problem.status !== PROBLEM_STATUS.CLOSED;

  return (
    <Section
      title="Related tickets"
      count={problem.tickets.length}
      icon="ticket-outline"
      action={
        canLink ? (
          <Button
            label="Link"
            icon="link-outline"
            size="sm"
            variant="ghost"
            onPress={() => setLinking(true)}
          />
        ) : undefined
      }
    >
      <AppText size="xs" tone="warning">
        Internal — each client sees only their own ticket.
      </AppText>
      {problem.tickets.length === 0 ? (
        <AppText size="sm" tone="muted">
          No tickets linked yet. Confirm a suggested duplicate on a ticket, or link tickets here.
        </AppText>
      ) : (
        problem.tickets.map((ticket) => (
          <ListRow
            key={ticket.ticketId}
            title={`${ticket.key} · ${ticket.title}`}
            subtitle={[
              ticket.clientOrganizationName,
              ticket.productVersion,
              PROBLEM_TICKET_RELATION_LABELS[ticket.relation],
            ]
              .filter(Boolean)
              .join(' · ')}
            trailing={
              isTicketStatus(ticket.status) ? (
                <Pill
                  label={TICKET_STATUS_LABELS[ticket.status]}
                  tone={ticketTone(ticket.status)}
                />
              ) : undefined
            }
            {...(onOpenTicket
              ? {
                  onPress: () => onOpenTicket(ticket.ticketId),
                  accessibilityHint: 'Opens the ticket',
                }
              : {})}
          />
        ))
      )}
      {linking ? <LinkTicketsSheet problem={problem} onClose={() => setLinking(false)} /> : null}
    </Section>
  );
}
