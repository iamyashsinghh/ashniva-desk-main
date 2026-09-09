import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  MAX_RELATIONS_PER_ITEM,
  PERMISSIONS,
  TICKET_STATUS,
  WORK_RELATION_TYPE,
  canTransitionTicket,
  duplicateCloseNote,
  planRelation,
  type AuthenticatedUser,
  type RelationEdge,
  type TicketRelationsResponse,
  type TicketStatus,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { TicketTransitionsService } from '../tickets/ticket-transitions.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketSummaryRow } from '../tickets/tickets.repository';
import type { CreateTicketRelationDto } from './dto/relation.dto';
import { RelationNotificationsService } from './relation-notifications.service';
import { otherTicketId, ticketKeyOf, toTicketRelationView } from './relations.mapper';
import { RelationsRepository, type TicketRelationRow } from './relations.repository';

/**
 * Duplicate and related tickets: a pointer, never a merge.
 *
 * The user's rule for this feature is one sentence — *do not destructively merge away ticket
 * history* — and the whole design follows from it. Marking A a duplicate of B writes one row and,
 * if the workflow allows it, moves A to CANCELLED with a note. Nothing moves between the two rows:
 * A keeps its replies, its attachments, its SLA record and its audit trail, and so does B. Unlink
 * deletes the row and nothing else.
 *
 * Two things are load-bearing for security here.
 *
 * The first is that a link is a disclosure. Knowing A points at B teaches the reader that B exists,
 * what it is called and whose it is, so the far end of every link is loaded under the same rule
 * that governs opening it directly, and a client is never shown even the shape of another client's
 * ticket.
 *
 * The second is the note. Two different clients can legitimately report the same fault, and the
 * closing note lands on the *duplicate's* own activity trail, which its client reads through
 * `GET /tickets/:id`. So the key of the ticket being kept is only named when both belong to the
 * same client — `duplicateCloseNote` in `@ashniva/types` is the one place that decides.
 */
@Injectable()
export class TicketRelationsService {
  constructor(
    private readonly relations: RelationsRepository,
    private readonly tickets: TicketsService,
    private readonly transitions: TicketTransitionsService,
    private readonly auditLog: AuditLogService,
    private readonly notifications: RelationNotificationsService,
  ) {}

  async list(actor: AuthenticatedUser, ticketId: string): Promise<TicketRelationsResponse> {
    const organizationId = await this.tickets.providerId(actor);
    const subject = await this.tickets.requireSummary(actor, ticketId);
    const rows = await this.relations.ticketRelations(
      organizationId,
      subject.id,
      MAX_RELATIONS_PER_ITEM,
    );
    return {
      relations: await this.project(actor, organizationId, subject.id, rows),
      canLink: this.mayLink(actor),
    };
  }

  /**
   * Links two tickets and, for a duplicate, closes the copy.
   *
   * The order is deliberate: the row is written first and the status moved second. A closure with
   * no link behind it would be a ticket cancelled for a reason nobody can follow, whereas a link
   * whose closure failed is merely a link somebody can act on by hand.
   */
  async link(
    actor: AuthenticatedUser,
    ticketId: string,
    dto: CreateTicketRelationDto,
  ): Promise<TicketRelationsResponse> {
    this.assertMayLink(actor);
    const organizationId = await this.tickets.providerId(actor);
    const subject = await this.tickets.requireSummary(actor, ticketId);
    const target = await this.tickets.requireSummary(actor, dto.targetTicketId);

    const edges = await this.relations.ticketEdgesFor(organizationId, [subject.id, target.id]);
    const decision = planRelation(
      { type: dto.type, fromId: subject.id, toId: target.id },
      edges.map(toEdge),
    );
    if (!decision.allowed) {
      throw new ConflictException(decision.reason);
    }

    const closing = this.shouldClose(dto, subject);
    const note = duplicateCloseNote({
      canonicalKey: ticketKeyOf(target),
      sameClient: subject.clientOrganizationId === target.clientOrganizationId,
    });
    const row = await this.relations.createTicketRelation({
      organizationId,
      type: decision.stored.type,
      sourceTicketId: decision.stored.sourceId,
      targetTicketId: decision.stored.targetId,
      note: dto.note ?? null,
      closedDuplicate: closing,
      linkedById: actor.userId,
    });

    if (closing) {
      await this.transitions.cancel(actor, subject.id, note);
    }
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_LINKED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: subject.id,
      organizationId,
      after: {
        relationId: row.id,
        type: row.type,
        sourceTicketId: row.sourceTicketId,
        targetTicketId: row.targetTicketId,
        closedDuplicate: closing,
      },
    });
    if (dto.type === WORK_RELATION_TYPE.DUPLICATE_OF) {
      await this.notifications.duplicateMarked(actor, {
        duplicate: subject,
        message: note,
        closed: closing,
      });
    }
    return this.list(actor, ticketId);
  }

  /**
   * Removes a link.
   *
   * The row goes and nothing else does. A duplicate that was closed stays closed: the closure is a
   * status change with its own history entry and its own audit record, and silently reversing it
   * here would be the destructive edit this feature exists to avoid. The audit entry says whether
   * a closure is still standing, so whoever unlinked can put it right deliberately.
   */
  async unlink(
    actor: AuthenticatedUser,
    ticketId: string,
    relationId: string,
  ): Promise<TicketRelationsResponse> {
    this.assertMayLink(actor);
    const organizationId = await this.tickets.providerId(actor);
    const subject = await this.tickets.requireSummary(actor, ticketId);
    const row = await this.relations.findTicketRelation(organizationId, relationId);
    if (!row || (row.sourceTicketId !== subject.id && row.targetTicketId !== subject.id)) {
      throw new NotFoundException('Link not found');
    }
    await this.relations.deleteTicketRelation(organizationId, relationId);
    await this.auditLog.record({
      action: AUDIT_ACTION.TICKET_UNLINKED,
      entityType: AUDIT_ENTITY_TYPE.TICKET,
      entityId: subject.id,
      organizationId,
      before: {
        relationId: row.id,
        type: row.type,
        sourceTicketId: row.sourceTicketId,
        targetTicketId: row.targetTicketId,
        closedDuplicate: row.closedDuplicate,
      },
    });
    return this.list(actor, ticketId);
  }

  /** The links already on this ticket, so the candidate list can say what is done. */
  async linkedIds(organizationId: string, ticketId: string): Promise<Set<string>> {
    const rows = await this.relations.ticketRelations(
      organizationId,
      ticketId,
      MAX_RELATIONS_PER_ITEM,
    );
    return new Set(rows.map((row) => otherTicketId(row, ticketId)));
  }

  private mayLink(actor: AuthenticatedUser): boolean {
    // `ticket:triage` and not a new permission: it is what already gates converting a ticket and
    // cancelling one as a duplicate, it is not in CLIENT_SAFE_PERMISSIONS, and a link that closes
    // a ticket is exactly the authority it names.
    return isInternalUser(actor) && actor.permissions.includes(PERMISSIONS.TICKET_TRIAGE);
  }

  private assertMayLink(actor: AuthenticatedUser): void {
    if (!this.mayLink(actor)) {
      throw new ForbiddenException('Linking tickets needs ticket:triage');
    }
  }

  /**
   * Whether marking this duplicate also closes it.
   *
   * Only when the caller asked for it (the default) and the workflow permits the move. A resolved
   * or already-cancelled ticket has no edge to CANCELLED, and forcing one would be a change to the
   * ticket workflow made for the convenience of this feature.
   */
  private shouldClose(dto: CreateTicketRelationDto, subject: TicketSummaryRow): boolean {
    return (
      dto.type === WORK_RELATION_TYPE.DUPLICATE_OF &&
      (dto.closeDuplicate ?? true) &&
      canTransitionTicket(subject.status as TicketStatus, TICKET_STATUS.CANCELLED)
    );
  }

  /**
   * Fills in the far end of every link the caller may read, and drops the rest for a client.
   *
   * Internal staff keep the redacted row — it tells a support person that a link exists to
   * something outside their reach, which is information they can act on. A client is shown nothing
   * at all: the existence of a link to another client's ticket is itself the disclosure.
   */
  private async project(
    actor: AuthenticatedUser,
    organizationId: string,
    ticketId: string,
    rows: TicketRelationRow[],
  ) {
    const internal = isInternalUser(actor);
    const readable = await this.relations.readableTickets(
      organizationId,
      rows.map((row) => otherTicketId(row, ticketId)),
      internal ? null : actor.organizationId,
    );
    const byId = new Map(readable.map((row) => [row.id, row]));
    const views = rows.map((row) => toTicketRelationView(row, ticketId, byId));
    return internal ? views : views.filter((view) => view.other !== null);
  }
}

function toEdge(row: TicketRelationRow): RelationEdge {
  return {
    type: row.type,
    sourceId: row.sourceTicketId,
    targetId: row.targetTicketId,
  };
}
