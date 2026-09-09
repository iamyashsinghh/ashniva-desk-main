import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  PERMISSIONS,
  rankSimilar,
  type AuthenticatedUser,
  type TicketRelationCandidatesResponse,
  type TicketStatus,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { toSimilarityCandidate } from '../recurring-issues/recurring-issues.mapper';
import { SimilarityRepository } from '../recurring-issues/similarity.repository';
import { TicketsService } from '../tickets/tickets.service';
import { ticketKeyOf } from './relations.mapper';
import { TicketRelationsService } from './ticket-relations.service';

/**
 * "Which ticket is this one probably a duplicate of?", for the link dialog.
 *
 * Nothing new is computed here. The fingerprint on every ticket row, the keyword extraction and
 * the ranking all belong to the recurring-issues package, which has had them since package 11;
 * this asks the same repository the same question and dresses the answer for a different dialog.
 * Two matchers would eventually disagree about what "the same fault" means, and the one that
 * disagreed would be this one.
 *
 * `ticket:triage` gates it rather than `problem:read`, because the decision it feeds is a link
 * rather than a problem, and because everything in the answer — key, title, client name — is
 * already on the ticket list that every internal reader can open.
 */
@Injectable()
export class TicketRelationCandidatesService {
  constructor(
    private readonly similarity: SimilarityRepository,
    private readonly tickets: TicketsService,
    private readonly relations: TicketRelationsService,
  ) {}

  async candidates(
    actor: AuthenticatedUser,
    ticketId: string,
  ): Promise<TicketRelationCandidatesResponse> {
    if (!isInternalUser(actor) || !actor.permissions.includes(PERMISSIONS.TICKET_TRIAGE)) {
      throw new ForbiddenException('Suggested duplicates need ticket:triage');
    }
    const organizationId = await this.tickets.providerId(actor);
    const subject = await this.similarity.findTicket(organizationId, ticketId);
    if (!subject) {
      throw new NotFoundException('Ticket not found');
    }
    const linked = await this.relations.linkedIds(organizationId, ticketId);
    const rows = await this.similarity.findCandidates({
      organizationId,
      ticketId,
      projectId: subject.projectId,
      productId: subject.productId,
      keywords: subject.keywords,
      fingerprint: subject.fingerprint,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    const candidates = rankSimilar(
      toSimilarityCandidate(subject),
      rows.map(toSimilarityCandidate),
    ).flatMap((entry) => {
      const ticket = byId.get(entry.candidate.ticketId);
      return ticket
        ? [
            {
              ticketId: ticket.id,
              key: ticketKeyOf(ticket),
              title: ticket.title,
              status: ticket.status as TicketStatus,
              clientOrganizationName: ticket.clientOrganization.name,
              score: entry.score,
              signals: entry.signals.map((signal) => signal.detail),
              alreadyLinked: linked.has(ticket.id),
            },
          ]
        : [];
    });
    return { candidates };
  }
}
