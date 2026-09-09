import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AUDIT_ACTION,
  AUDIT_ENTITY_TYPE,
  PRIORITY,
  PROBLEM_STATUS,
  PROBLEM_TICKET_RELATION,
  isProblemOpen,
  type AuthenticatedUser,
  type PaginatedResponse,
  type ProblemDetail,
  type ProblemStatus,
  type ProblemSummary,
  type ProblemTicketRelation,
} from '@ashniva/types';

import { isInternalUser } from '../../common/auth/access-scope';
import type { Prisma } from '../../generated/prisma/client';
import { AuditLogService } from '../audit-logs/audit-log.service';
import type { CreateProblemDto, ListProblemsQueryDto, UpdateProblemDto } from './dto/problem.dto';
import { problemClosureFor } from './problem-closure';
import { ProblemLinkingService } from './problem-linking.service';
import { problemKey, toProblemDetail, toProblemSummary } from './problems.mapper';
import { ProblemsRepository, type ProblemDetailRow } from './problems.repository';

/**
 * Reads, creation and edits of a problem. The workflow actions live in `ProblemActionsService`
 * and the ticket-group arithmetic in `ProblemLinkingService`.
 *
 * A problem is internal by definition: it names every client who reported the same fault, and the
 * requirement is explicit that one client never learns another reported it. There is no portal
 * counterpart to this service and no mapper that could build one.
 */
@Injectable()
export class ProblemsService {
  constructor(
    private readonly problems: ProblemsRepository,
    private readonly linking: ProblemLinkingService,
    private readonly auditLog: AuditLogService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    query: ListProblemsQueryDto,
  ): Promise<PaginatedResponse<ProblemSummary>> {
    this.assertInternal(actor);
    const page = await this.problems.list({
      organizationId: actor.organizationId,
      status: query.status,
      projectId: query.projectId,
      productId: query.productId,
      ownerId: query.ownerId,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });
    return {
      items: page.items.map(toProblemSummary),
      nextCursor: page.nextCursor,
      total: page.total,
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<ProblemDetail> {
    return this.detail(await this.require(actor, id));
  }

  /**
   * Opens a problem by hand, optionally with the tickets it is about.
   *
   * `thresholdHitAt` stays null: this problem exists because a person judged it worth opening,
   * not because a count crossed a line, and the two are worth telling apart on the screen.
   */
  async create(actor: AuthenticatedUser, dto: CreateProblemDto): Promise<ProblemDetail> {
    this.assertInternal(actor);
    const ticketIds = [...new Set(dto.ticketIds ?? [])];
    const tickets = await this.linking.requireTickets(actor.organizationId, ticketIds);
    const first = tickets[0];

    const row = await this.problems.create(actor.organizationId, {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      severity: dto.severity ?? PRIORITY.HIGH,
      // The blanks are filled from the first ticket: a problem raised from a group belongs to the
      // project and product that group belongs to, and asking twice invites the two to disagree.
      projectId: dto.projectId ?? first?.projectId ?? null,
      productId: dto.productId ?? first?.productId ?? null,
      module: dto.module?.trim() || first?.module || null,
      versions: [],
      createdById: actor.userId,
    });

    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_CREATED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: row.id,
      organizationId: actor.organizationId,
      after: { key: problemKey(row), title: row.title, ticketIds },
    });

    if (tickets.length > 0) {
      await this.linking.link(
        actor,
        row.id,
        tickets,
        dto.relation ?? PROBLEM_TICKET_RELATION.DUPLICATE,
      );
    }
    return this.get(actor, row.id);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateProblemDto,
  ): Promise<ProblemDetail> {
    const before = await this.require(actor, id);
    if (!isProblemOpen(before.status as ProblemStatus)) {
      throw new ConflictException('A closed problem can no longer be edited');
    }
    const data: Prisma.ProblemUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
      ...(dto.module !== undefined ? { module: dto.module.trim() || null } : {}),
    };
    if (dto.ownerId !== undefined) {
      if (dto.ownerId && !(await this.problems.findMember(actor.organizationId, dto.ownerId))) {
        throw new BadRequestException('That person is not a member of this organization');
      }
      data.ownerId = dto.ownerId;
    }
    if (Object.keys(data).length === 0) {
      return this.detail(before);
    }
    await this.problems.update(actor.organizationId, id, data);
    await this.auditLog.record({
      action: AUDIT_ACTION.PROBLEM_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.PROBLEM,
      entityId: id,
      organizationId: actor.organizationId,
      before: { title: before.title, severity: before.severity, ownerId: before.ownerId },
      after: { title: data.title ?? before.title, severity: data.severity ?? before.severity },
    });
    return this.get(actor, id);
  }

  /** Links more tickets into a problem that already exists. */
  async linkTickets(
    actor: AuthenticatedUser,
    id: string,
    ticketIds: string[],
    relation: ProblemTicketRelation = PROBLEM_TICKET_RELATION.DUPLICATE,
  ): Promise<ProblemDetail> {
    const problem = await this.require(actor, id);
    if (problem.status === PROBLEM_STATUS.CLOSED) {
      throw new ConflictException('A closed problem takes no more tickets');
    }
    const tickets = await this.linking.requireTickets(actor.organizationId, [
      ...new Set(ticketIds),
    ]);
    await this.linking.link(actor, id, tickets, relation);
    return this.get(actor, id);
  }

  /** Loads a problem inside the caller's tenant, or reports it as missing. */
  async require(actor: AuthenticatedUser, id: string): Promise<ProblemDetailRow> {
    this.assertInternal(actor);
    const row = await this.problems.findDetail(actor.organizationId, id);
    if (!row) {
      throw new NotFoundException('Problem not found');
    }
    return row;
  }

  /** The closure decision travels on every detail response, computed here and nowhere else. */
  detail(row: ProblemDetailRow): ProblemDetail {
    return toProblemDetail(row, problemClosureFor(row));
  }

  assertInternal(actor: AuthenticatedUser): void {
    if (!isInternalUser(actor)) {
      throw new ForbiddenException('Problems are internal');
    }
  }
}
