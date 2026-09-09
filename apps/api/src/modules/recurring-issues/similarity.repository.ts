import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, SimilarityDecision } from '../../generated/prisma/client';

const candidateSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  type: true,
  module: true,
  projectId: true,
  productId: true,
  productVersion: true,
  keywords: true,
  fingerprint: true,
  problemId: true,
  clientOrganizationId: true,
  clientOrganization: { select: { name: true } },
  createdAt: true,
} satisfies Prisma.TicketSelect;

export type CandidateTicket = Prisma.TicketGetPayload<{ select: typeof candidateSelect }>;

/** How many rows the candidate query may bring back before ranking narrows them. */
const CANDIDATE_SCAN_LIMIT = 200;

/**
 * Similarity data access: the candidate query, and the decisions people took on it.
 *
 * The candidate query is the only expensive thing in the package, so it is bounded twice — by the
 * indexed conditions in the WHERE clause, and by a hard row limit. Ranking is pure arithmetic on
 * what comes back.
 */
@Injectable()
export class SimilarityRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTicket(organizationId: string, id: string): Promise<CandidateTicket | null> {
    return this.prisma.ticket.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: candidateSelect,
    });
  }

  /**
   * Tickets worth comparing with this one.
   *
   * Same provider, same project *or* same product, not cancelled, not deleted, not itself — and
   * then narrowed to rows that share at least one keyword or have the identical fingerprint.
   * Without that last clause this is a table scan of every ticket the project ever had; with it,
   * the GIN index on `keywords` and the btree on `(organization_id, fingerprint)` answer it.
   */
  findCandidates(input: {
    organizationId: string;
    ticketId: string;
    projectId: string | null;
    productId: string | null;
    keywords: string[];
    fingerprint: string | null;
  }): Promise<CandidateTicket[]> {
    const scope: Prisma.TicketWhereInput[] = [];
    if (input.projectId) {
      scope.push({ projectId: input.projectId });
    }
    if (input.productId) {
      scope.push({ productId: input.productId });
    }

    const overlap: Prisma.TicketWhereInput[] = [];
    if (input.keywords.length > 0) {
      overlap.push({ keywords: { hasSome: input.keywords } });
    }
    if (input.fingerprint) {
      overlap.push({ fingerprint: input.fingerprint });
    }
    if (overlap.length === 0) {
      // A ticket with no keywords and no fingerprint has nothing to match on. Returning
      // everything in the project would be worse than returning nothing.
      return Promise.resolve([]);
    }

    return this.prisma.ticket.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        id: { not: input.ticketId },
        status: { not: 'CANCELLED' },
        ...(scope.length > 0 ? { OR: scope } : {}),
        AND: [{ OR: overlap }],
      },
      select: candidateSelect,
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_SCAN_LIMIT,
    });
  }

  /** Named tickets, scoped. Used to show a decided pair that ranking would no longer surface. */
  findByIds(organizationId: string, ids: string[]): Promise<CandidateTicket[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.ticket.findMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      select: candidateSelect,
    });
  }

  /** Every decision already recorded about this ticket, in either direction. */
  findDecisions(organizationId: string, ticketId: string) {
    return this.prisma.similarityMatch.findMany({
      where: {
        organizationId,
        OR: [{ ticketId }, { candidateTicketId: ticketId }],
      },
      select: {
        ticketId: true,
        candidateTicketId: true,
        decision: true,
        score: true,
        signals: true,
        decidedAt: true,
      },
    });
  }

  /**
   * Records a decision about a pair, in both directions.
   *
   * Two rows, one per ordered pair, so dismissing a suggestion from either ticket dismisses it
   * from the other. One row would mean the same pair came back as a fresh suggestion the moment
   * somebody opened the other ticket, which is exactly how people learn to ignore the panel.
   */
  decide(input: {
    organizationId: string;
    ticketId: string;
    candidateTicketId: string;
    decision: SimilarityDecision;
    score: number;
    signals: string[];
    decidedById: string | null;
  }): Promise<void> {
    const pairs = [
      { ticketId: input.ticketId, candidateTicketId: input.candidateTicketId },
      { ticketId: input.candidateTicketId, candidateTicketId: input.ticketId },
    ];
    return this.prisma.$transaction(async (tx) => {
      for (const pair of pairs) {
        await tx.similarityMatch.upsert({
          where: {
            ticketId_candidateTicketId: pair,
          },
          update: {
            decision: input.decision,
            decidedById: input.decidedById,
            decidedAt: input.decidedById ? new Date() : null,
            score: input.score,
            signals: input.signals,
          },
          create: {
            ...pair,
            organizationId: input.organizationId,
            decision: input.decision,
            decidedById: input.decidedById,
            decidedAt: input.decidedById ? new Date() : null,
            score: input.score,
            signals: input.signals,
          },
        });
      }
    });
  }
}
