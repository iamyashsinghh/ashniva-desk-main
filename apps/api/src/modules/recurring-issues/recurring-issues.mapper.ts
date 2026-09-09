import {
  type SimilarTicketSuggestion,
  type SimilarityCandidate,
  type SimilarityDecision,
} from '@ashniva/types';

import { errorCodeFromFingerprint } from '../tickets/ticket-fingerprint';
import { ticketKey } from '../tickets/tickets.mapper';
import type { CandidateTicket } from './similarity.repository';

/**
 * A stored ticket reduced to the facts the matcher compares.
 *
 * The error code is read back out of the fingerprint rather than re-extracted from the text: the
 * fingerprint is a readable join for exactly this reason, and re-deriving it would mean loading
 * every candidate's full description just to scan it again.
 */
export function toSimilarityCandidate(ticket: CandidateTicket): SimilarityCandidate {
  return {
    ticketId: ticket.id,
    productId: ticket.productId,
    module: ticket.module,
    productVersion: ticket.productVersion,
    type: ticket.type,
    keywords: ticket.keywords,
    errorCode: errorCodeFromFingerprint(ticket.fingerprint),
  };
}

/**
 * One suggestion, as the person deciding sees it.
 *
 * The client's name is here because the person reading it is internal and the whole question is
 * whether this is one client reporting twice or two clients reporting the same fault. Nothing
 * maps this type into a client response.
 */
export function toSuggestion(input: {
  ticket: CandidateTicket;
  score: number;
  signals: readonly string[];
  decision: SimilarityDecision;
}): SimilarTicketSuggestion {
  return {
    ticketId: input.ticket.id,
    key: ticketKey(input.ticket),
    title: input.ticket.title,
    status: input.ticket.status,
    module: input.ticket.module,
    productVersion: input.ticket.productVersion,
    clientOrganizationId: input.ticket.clientOrganizationId,
    clientOrganizationName: input.ticket.clientOrganization.name,
    score: input.score,
    signals: [...input.signals],
    decision: input.decision,
    problemId: input.ticket.problemId,
    createdAt: input.ticket.createdAt.toISOString(),
  };
}
