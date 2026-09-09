import {
  PROBLEM_TICKET_RELATION_LABELS,
  type ProblemDetail,
  type TicketStatus,
} from '@ashniva/types';
import { Badge, Card, EmptyState } from '@ashniva/ui';
import { Link } from 'react-router';

import { TicketStatusPill } from '../../../shared/components/StatusPills';

import '../problems.css';

/**
 * The tickets this problem groups.
 *
 * Each row names the client that reported it, which is the whole point of the list: a support
 * executive cannot tell three reports from one without it. The INTERNAL badge on the card is the
 * approved design's reminder of why that is safe — each client only ever sees its own ticket and
 * its own thread, and nothing maps this card into a client response.
 */
export function RelatedTicketsCard({ problem }: { problem: ProblemDetail }) {
  return (
    <Card
      title={`Related tickets (${problem.tickets.length})`}
      headerAddon={<Badge tone="warning">INTERNAL — each client sees only their own ticket</Badge>}
    >
      {problem.tickets.length === 0 ? (
        <EmptyState
          title="No tickets linked yet"
          description="Confirm a suggested duplicate on a ticket, or link tickets from here."
        />
      ) : (
        <ul className="problem-tickets">
          {problem.tickets.map((ticket) => (
            <li key={ticket.ticketId} className="problem-tickets__row">
              <Link to={`/tickets/${ticket.ticketId}`}>{ticket.key}</Link>
              <span>
                {ticket.title}
                <span className="problem-tickets__client">
                  {' '}
                  · {ticket.clientOrganizationName}
                  {ticket.productVersion ? ` · ${ticket.productVersion}` : ''}
                  {' · '}
                  {PROBLEM_TICKET_RELATION_LABELS[ticket.relation]}
                </span>
              </span>
              <TicketStatusPill status={ticket.status as TicketStatus} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
