import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PERMISSIONS,
  PROBLEM_TICKET_RELATION,
  SIMILARITY_DECISION,
  crossesDuplicateThreshold,
  rankSimilar,
  similarityScore,
  type AuthenticatedUser,
  type SimilarTicketSuggestion,
  type SimilarTicketsResponse,
  type SimilarityDecision,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { ProblemLinkingService } from '../problems/problem-linking.service';
import type { DecideSimilarityDto } from './dto/similarity.dto';
import { toSimilarityCandidate, toSuggestion } from './recurring-issues.mapper';
import { SimilarityRepository, type CandidateTicket } from './similarity.repository';

/** A decision already taken about a pair, whichever way round it was recorded. */
interface StoredDecision {
  decision: SimilarityDecision;
  score: number;
  signals: string[];
}

/**
 * "Is this the same ticket we already have?" — suggested, never decided.
 *
 * Nothing here merges anything. The matcher produces a ranked list and the reasons behind each
 * entry, and a person with `problem:manage` says yes or no. That is the requirement, and it is
 * also the only safe design: a wrong automatic link would put one client's report inside another
 * client's problem.
 */
@Injectable()
export class SimilarityService {
  constructor(
    private readonly similarity: SimilarityRepository,
    private readonly linking: ProblemLinkingService,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * The suggestions for one ticket, with what has already been decided about each.
   *
   * Decided pairs stay in the list. A dismissal that vanished from the screen would look like a
   * suggestion that never appeared, and the next person would dismiss it again.
   */
  async suggestionsFor(
    actor: AuthenticatedUser,
    ticketId: string,
  ): Promise<SimilarTicketsResponse> {
    const subject = await this.requireTicket(actor, ticketId);
    const threshold = await this.linking.thresholdFor(actor.organizationId, subject.projectId);
    const enabled = await this.similarityEnabled(actor, subject.projectId);

    const decisions = await this.storedDecisions(actor, ticketId);
    const candidates = enabled
      ? await this.similarity.findCandidates({
          organizationId: actor.organizationId,
          ticketId,
          projectId: subject.projectId,
          productId: subject.productId,
          keywords: subject.keywords,
          fingerprint: subject.fingerprint,
        })
      : [];

    const byId = new Map(candidates.map((ticket) => [ticket.id, ticket]));
    const suggestions: SimilarTicketSuggestion[] = rankSimilar(
      toSimilarityCandidate(subject),
      candidates.map(toSimilarityCandidate),
    ).flatMap((entry) => {
      const ticket = byId.get(entry.candidate.ticketId);
      return ticket
        ? [
            toSuggestion({
              ticket,
              score: entry.score,
              signals: entry.signals.map((signal) => signal.detail),
              decision: decisions.get(ticket.id)?.decision ?? SIMILARITY_DECISION.PENDING,
            }),
          ]
        : [];
    });

    const shown = new Set(suggestions.map((suggestion) => suggestion.ticketId));
    suggestions.push(...(await this.decidedButUnranked(actor, decisions, shown)));

    const clientIds = [
      subject.clientOrganizationId,
      ...suggestions
        .filter((suggestion) => suggestion.decision !== SIMILARITY_DECISION.DISMISSED)
        .map((suggestion) => suggestion.clientOrganizationId),
    ];
    return {
      suggestions,
      clientCount: new Set(clientIds).size,
      duplicateThreshold: threshold,
      thresholdReached: crossesDuplicateThreshold(clientIds, threshold),
      // The problem this ticket belongs to, or the one its still-standing suggestions belong to.
      // A dismissed pair is not a route into a problem: somebody said they were different faults.
      problemId:
        subject.problemId ??
        suggestions.find(
          (suggestion) =>
            suggestion.problemId !== null && suggestion.decision !== SIMILARITY_DECISION.DISMISSED,
        )?.problemId ??
        null,
    };
  }

  /**
   * Records what somebody decided about one suggested pair.
   *
   * Two permissions, and they are not the same authority. `problem:manage` may join two clients'
   * tickets into one problem. `problem:suggest-duplicate` may say "these look the same" and may
   * dismiss a suggestion — a request to link from that permission is stored as the suggestion it
   * is, waiting for somebody who may confirm it. The requirement is explicit that a person
   * confirms every link, and a support executive is not that person.
   */
  async decide(
    actor: AuthenticatedUser,
    ticketId: string,
    candidateId: string,
    dto: DecideSimilarityDto,
  ): Promise<SimilarTicketsResponse> {
    const subject = await this.requireTicket(actor, ticketId);
    const candidate = await this.requireTicket(actor, candidateId);
    if (subject.id === candidate.id) {
      throw new NotFoundException('Ticket not found');
    }

    const mayConfirm = actor.permissions.includes(PERMISSIONS.PROBLEM_MANAGE);
    const maySuggest = actor.permissions.includes(PERMISSIONS.PROBLEM_SUGGEST_DUPLICATE);
    if (!mayConfirm && !maySuggest) {
      throw new ForbiddenException(
        'Deciding a suggested duplicate needs problem:manage or problem:suggest-duplicate',
      );
    }
    const linking = dto.decision === SIMILARITY_DECISION.LINKED;
    // A suggestion, not a link: stored PENDING with nobody recorded as having decided it, so the
    // pair keeps appearing to whoever may confirm it.
    const recorded: SimilarityDecision =
      linking && !mayConfirm ? SIMILARITY_DECISION.PENDING : dto.decision;

    const { score, signals } = similarityScore(
      toSimilarityCandidate(subject),
      toSimilarityCandidate(candidate),
    );
    await this.similarity.decide({
      organizationId: actor.organizationId,
      ticketId: subject.id,
      candidateTicketId: candidate.id,
      decision: recorded,
      score,
      signals: signals.map((signal) => signal.detail),
      decidedById: recorded === SIMILARITY_DECISION.PENDING ? null : actor.userId,
    });

    if (linking && mayConfirm) {
      await this.joinIntoProblem(actor, [subject.id, candidate.id], dto.problemId);
    }

    await this.auditLog.record({
      action: AUDIT_ACTION.SIMILARITY_DECIDED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: subject.id,
      organizationId: actor.organizationId,
      after: {
        candidateTicketId: candidate.id,
        requested: dto.decision,
        recorded,
        problemId: dto.problemId ?? null,
        score,
      },
    });
    return this.suggestionsFor(actor, ticketId);
  }

  /**
   * Puts a confirmed pair into a problem.
   *
   * A named problem is used as given; otherwise the group's own problem is found or one is made
   * for it. Linking is what runs the threshold count, so the "three clients" alert is a
   * consequence of the decision rather than a second thing somebody has to remember.
   */
  private async joinIntoProblem(
    actor: AuthenticatedUser,
    ticketIds: string[],
    problemId: string | undefined,
  ): Promise<void> {
    const tickets = await this.linking.requireTickets(actor.organizationId, ticketIds);
    const target = problemId
      ? await this.linking.requireProblem(actor.organizationId, problemId)
      : (await this.linking.problemForGroup(actor, tickets)).problemId;
    await this.linking.link(actor, target, tickets, PROBLEM_TICKET_RELATION.DUPLICATE);
  }

  /** Pairs somebody decided on that today's ranking no longer reaches. */
  private async decidedButUnranked(
    actor: AuthenticatedUser,
    decisions: Map<string, StoredDecision>,
    shown: Set<string>,
  ): Promise<SimilarTicketSuggestion[]> {
    const missing = [...decisions.keys()].filter((id) => !shown.has(id));
    const tickets = await this.similarity.findByIds(actor.organizationId, missing);
    return tickets.map((ticket) => {
      const stored = decisions.get(ticket.id);
      return toSuggestion({
        ticket,
        score: stored?.score ?? 0,
        signals: stored?.signals ?? [],
        decision: stored?.decision ?? SIMILARITY_DECISION.PENDING,
      });
    });
  }

  /** Decisions keyed by the *other* ticket, whichever way round the row was written. */
  private async storedDecisions(
    actor: AuthenticatedUser,
    ticketId: string,
  ): Promise<Map<string, StoredDecision>> {
    const rows = await this.similarity.findDecisions(actor.organizationId, ticketId);
    const decisions = new Map<string, StoredDecision>();
    for (const row of rows) {
      const other = row.ticketId === ticketId ? row.candidateTicketId : row.ticketId;
      decisions.set(other, {
        decision: row.decision,
        score: Number(row.score),
        signals: row.signals,
      });
    }
    return decisions;
  }

  /** Per project, because one client may want the suggestions and another may not. */
  private async similarityEnabled(
    actor: AuthenticatedUser,
    projectId: string | null,
  ): Promise<boolean> {
    if (!projectId) {
      return true;
    }
    const ownership = await this.linking.ownershipFor(actor.organizationId, projectId);
    return ownership?.similarityEnabled ?? true;
  }

  private async requireTicket(
    actor: AuthenticatedUser,
    ticketId: string,
  ): Promise<CandidateTicket> {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Duplicate suggestions are internal');
    }
    const ticket = await this.similarity.findTicket(actor.organizationId, ticketId);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }
}
