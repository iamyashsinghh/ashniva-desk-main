import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, WorkRelationType } from '../../generated/prisma/client';

const linkedBySelect = { select: { id: true, name: true, email: true } };

const ticketRelationSelect = {
  id: true,
  type: true,
  sourceTicketId: true,
  targetTicketId: true,
  note: true,
  closedDuplicate: true,
  linkedAt: true,
  linkedBy: linkedBySelect,
} satisfies Prisma.TicketRelationSelect;

const taskRelationSelect = {
  id: true,
  type: true,
  sourceTaskId: true,
  targetTaskId: true,
  note: true,
  linkedAt: true,
  linkedBy: linkedBySelect,
} satisfies Prisma.TaskRelationSelect;

export type TicketRelationRow = Prisma.TicketRelationGetPayload<{
  select: typeof ticketRelationSelect;
}>;
export type TaskRelationRow = Prisma.TaskRelationGetPayload<{ select: typeof taskRelationSelect }>;

const relatedTicketSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  clientOrganizationId: true,
  clientOrganization: { select: { id: true, name: true, slug: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TicketSelect;

const relatedTaskSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  priority: true,
  project: { select: { code: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TaskSelect;

export type RelatedTicketRow = Prisma.TicketGetPayload<{ select: typeof relatedTicketSelect }>;
export type RelatedTaskRow = Prisma.TaskGetPayload<{ select: typeof relatedTaskSelect }>;

/**
 * The two relation tables, read and written the same way.
 *
 * Both are keyed on an ordered pair and both are read from either end, so every query here comes
 * in a "source or target" shape. The far ends are loaded separately and under the caller's own
 * read scope — see `ticket-relations.service.ts` — rather than through an `include` here, because
 * a join would hand the mapper rows the caller may not be shown and leave it to remember to drop
 * them.
 */
@Injectable()
export class RelationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every link touching this ticket, in either direction, newest first. */
  ticketRelations(
    organizationId: string,
    ticketId: string,
    take: number,
  ): Promise<TicketRelationRow[]> {
    return this.prisma.ticketRelation.findMany({
      where: {
        organizationId,
        OR: [{ sourceTicketId: ticketId }, { targetTicketId: ticketId }],
      },
      select: ticketRelationSelect,
      orderBy: { linkedAt: 'desc' },
      take,
    });
  }

  /**
   * Every link touching either of two tickets.
   *
   * The guard in `planRelation` needs both items' edges to answer "is this a chain" and "is this
   * pair already linked", and one query is cheaper than two.
   */
  ticketEdgesFor(organizationId: string, ticketIds: string[]): Promise<TicketRelationRow[]> {
    return this.prisma.ticketRelation.findMany({
      where: {
        organizationId,
        OR: [{ sourceTicketId: { in: ticketIds } }, { targetTicketId: { in: ticketIds } }],
      },
      select: ticketRelationSelect,
    });
  }

  createTicketRelation(input: {
    organizationId: string;
    type: WorkRelationType;
    sourceTicketId: string;
    targetTicketId: string;
    note: string | null;
    closedDuplicate: boolean;
    linkedById: string;
  }): Promise<TicketRelationRow> {
    return this.prisma.ticketRelation.create({ data: input, select: ticketRelationSelect });
  }

  findTicketRelation(
    organizationId: string,
    relationId: string,
  ): Promise<TicketRelationRow | null> {
    return this.prisma.ticketRelation.findFirst({
      where: { id: relationId, organizationId },
      select: ticketRelationSelect,
    });
  }

  /** Removes the pointer, and only the pointer. Nothing on either ticket is touched. */
  async deleteTicketRelation(organizationId: string, relationId: string): Promise<void> {
    await this.prisma.ticketRelation.deleteMany({ where: { id: relationId, organizationId } });
  }

  taskRelations(organizationId: string, taskId: string, take: number): Promise<TaskRelationRow[]> {
    return this.prisma.taskRelation.findMany({
      where: { organizationId, OR: [{ sourceTaskId: taskId }, { targetTaskId: taskId }] },
      select: taskRelationSelect,
      orderBy: { linkedAt: 'desc' },
      take,
    });
  }

  /**
   * Every link touching either of two tasks — deliberately *not* narrowed by the caller's scope.
   *
   * These rows feed `planRelation`, which has to see the whole neighbourhood to answer "is this a
   * chain" and "is this pair already linked". Hiding the edges a caller may not read would let
   * somebody build a cycle through a task they cannot see, and would turn a refusal into a
   * duplicate row. Nothing from these rows is rendered: the far ends still go through
   * `readableTasks`.
   */
  taskEdgesFor(organizationId: string, taskIds: string[]): Promise<TaskRelationRow[]> {
    return this.prisma.taskRelation.findMany({
      where: {
        organizationId,
        OR: [{ sourceTaskId: { in: taskIds } }, { targetTaskId: { in: taskIds } }],
      },
      select: taskRelationSelect,
    });
  }

  createTaskRelation(input: {
    organizationId: string;
    type: WorkRelationType;
    sourceTaskId: string;
    targetTaskId: string;
    note: string | null;
    linkedById: string;
  }): Promise<TaskRelationRow> {
    return this.prisma.taskRelation.create({ data: input, select: taskRelationSelect });
  }

  findTaskRelation(organizationId: string, relationId: string): Promise<TaskRelationRow | null> {
    return this.prisma.taskRelation.findFirst({
      where: { id: relationId, organizationId },
      select: taskRelationSelect,
    });
  }

  async deleteTaskRelation(organizationId: string, relationId: string): Promise<void> {
    await this.prisma.taskRelation.deleteMany({ where: { id: relationId, organizationId } });
  }

  /**
   * The tickets the caller may read, out of a named set.
   *
   * This is the whole of the visibility rule for a linked ticket, expressed as the same predicate
   * `TicketsService.requireSummary` applies when the ticket is opened directly: the provider's
   * rows, and — for a client user — only their own organization's. Anything a caller asks for and
   * does not get back is redacted by the mapper rather than reported, so an id cannot be probed
   * through the panel.
   */
  readableTickets(
    organizationId: string,
    ids: string[],
    clientOrganizationId: string | null,
  ): Promise<RelatedTicketRow[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.ticket.findMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        ...(clientOrganizationId ? { clientOrganizationId } : {}),
      },
      select: relatedTicketSelect,
    });
  }

  /**
   * The tasks the caller may read, out of a named set.
   *
   * Two narrowings, and both matter. The tenant, because tasks are internal everywhere in the
   * product. And `scope` — the predicate for "tasks this person may open", supplied by whoever
   * owns that rule (see `task-scope.ts`) — because a caller who gets a 404 asking for a task
   * directly must not be handed its title through a link.
   *
   * `AND` rather than a spread: the scope is an `OR` of several ownership clauses, and spreading
   * it would collide with any `OR` this `where` grows later.
   */
  readableTasks(
    organizationId: string,
    ids: string[],
    scope?: Prisma.TaskWhereInput,
  ): Promise<RelatedTaskRow[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.task.findMany({
      where: {
        id: { in: ids },
        organizationId,
        deletedAt: null,
        ...(scope ? { AND: [scope] } : {}),
      },
      select: relatedTaskSelect,
    });
  }
}
