import { Injectable } from '@nestjs/common';
import {
  WORKLOAD_TASK_STATUSES,
  WORKLOAD_TICKET_STATUSES,
  type WorkloadCounts,
} from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';

const userRef = { select: { id: true, name: true, email: true } } as const;

const stateInclude = {
  acknowledgedBy: userRef,
  manualOverrideBy: userRef,
} satisfies Prisma.TicketRoutingStateInclude;

const trailInclude = { candidateUser: userRef } satisfies Prisma.TicketRoutingTrailInclude;

export type RoutingStateRow = Prisma.TicketRoutingStateGetPayload<{ include: typeof stateInclude }>;
export type RoutingTrailRowModel = Prisma.TicketRoutingTrailGetPayload<{
  include: typeof trailInclude;
}>;

export type TrailInput = Omit<
  Prisma.TicketRoutingTrailUncheckedCreateInput,
  'organizationId' | 'ticketId'
>;

/**
 * Data access for routing state, the decision trail and the workload numbers the router compares
 * against a limit. Every query carries `organizationId`; row-level security is the backstop.
 */
@Injectable()
export class TicketRoutingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findState(organizationId: string, ticketId: string): Promise<RoutingStateRow | null> {
    return this.prisma.ticketRoutingState.findFirst({
      where: { ticketId, organizationId },
      include: stateInclude,
    });
  }

  trailFor(organizationId: string, ticketId: string): Promise<RoutingTrailRowModel[]> {
    return this.prisma.ticketRoutingTrail.findMany({
      where: { ticketId, organizationId },
      include: trailInclude,
      orderBy: [{ attempt: 'asc' }, { position: 'asc' }],
    });
  }

  /**
   * Claims the right to route this ticket, by moving the attempt counter from `expected` to
   * `expected + 1`.
   *
   * This is the whole concurrency story for routing. Two workers that both decide to route the
   * same ticket read the same `attempt`, and exactly one of their conditional updates matches —
   * the loser gets `count === 0` and stops rather than assigning a second person over the first.
   * `upsert` cannot do this: it would happily let both through.
   */
  async claimAttempt(
    organizationId: string,
    ticketId: string,
    expected: number,
  ): Promise<number | null> {
    if (expected === 0) {
      // No state row yet. `create` fails on the primary key if another worker got there first,
      // which is the same race decided the same way.
      const created = await this.prisma.ticketRoutingState
        .create({
          data: { ticketId, organizationId, outcome: 'SUPPORT_QUEUE', attempt: 1 },
        })
        .catch(() => null);
      return created ? 1 : null;
    }
    const claimed = await this.prisma.ticketRoutingState.updateMany({
      where: { ticketId, organizationId, attempt: expected },
      data: { attempt: expected + 1 },
    });
    return claimed.count === 1 ? expected + 1 : null;
  }

  saveState(
    organizationId: string,
    ticketId: string,
    attempt: number,
    data: Omit<
      Prisma.TicketRoutingStateUncheckedUpdateInput,
      'ticketId' | 'organizationId' | 'attempt'
    >,
  ): Promise<Prisma.BatchPayload> {
    // Still guarded by the attempt we claimed: a newer attempt has already superseded this one.
    return this.prisma.ticketRoutingState.updateMany({
      where: { ticketId, organizationId, attempt },
      data,
    });
  }

  recordTrail(
    organizationId: string,
    ticketId: string,
    rows: readonly TrailInput[],
  ): Promise<Prisma.BatchPayload> {
    return this.prisma.ticketRoutingTrail.createMany({
      data: rows.map((row) => ({ ...row, organizationId, ticketId })),
    });
  }

  /**
   * Marks the ticket acknowledged, but only if it has not been already.
   *
   * The condition is what stops a developer's click and the escalation sweep from both winning:
   * whichever runs second sees `acknowledgedAt` already set and does nothing.
   */
  async acknowledge(
    organizationId: string,
    ticketId: string,
    userId: string,
    at: Date,
  ): Promise<boolean> {
    const done = await this.prisma.ticketRoutingState.updateMany({
      where: { ticketId, organizationId, acknowledgedAt: null },
      data: {
        acknowledgedAt: at,
        acknowledgedById: userId,
        acknowledgeDueAt: null,
      },
    });
    return done.count === 1;
  }

  /** Tickets whose acknowledgement window has run out and that nobody has picked up. */
  dueForAcknowledgement(now: Date, limit: number): Promise<RoutingStateRow[]> {
    return this.prisma.ticketRoutingState.findMany({
      where: {
        acknowledgedAt: null,
        acknowledgeDueAt: { lte: now },
        manualOverrideAt: null,
        ticket: { deletedAt: null },
      },
      include: stateInclude,
      orderBy: { acknowledgeDueAt: 'asc' },
      take: limit,
    });
  }

  /** Tickets past their escalation deadline that are still nobody's problem. */
  dueForEscalation(now: Date, limit: number): Promise<RoutingStateRow[]> {
    return this.prisma.ticketRoutingState.findMany({
      where: { escalationDueAt: { lte: now }, ticket: { deletedAt: null } },
      include: stateInclude,
      orderBy: { escalationDueAt: 'asc' },
      take: limit,
    });
  }

  /**
   * How much open work each of these people is holding.
   *
   * Two grouped counts rather than a query per candidate: routing considers a handful of people
   * for every ticket, and a per-candidate round trip would put the chain's length into the
   * latency of raising a ticket.
   */
  async workloadFor(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<Map<string, WorkloadCounts>> {
    const counts = new Map<string, WorkloadCounts>();
    if (userIds.length === 0) {
      return counts;
    }
    const ids = [...userIds];
    const [tickets, tasks] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['assignedToId'],
        where: {
          organizationId,
          deletedAt: null,
          assignedToId: { in: ids },
          status: { in: [...WORKLOAD_TICKET_STATUSES] },
        },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assignedToId'],
        where: {
          organizationId,
          deletedAt: null,
          assignedToId: { in: ids },
          status: { in: [...WORKLOAD_TASK_STATUSES] },
        },
        _count: { _all: true },
      }),
    ]);

    for (const id of ids) {
      counts.set(id, { openTickets: 0, activeTasks: 0 });
    }
    for (const row of tickets) {
      const entry = counts.get(row.assignedToId ?? '');
      if (entry) {
        entry.openTickets = row._count._all;
      }
    }
    for (const row of tasks) {
      const entry = counts.get(row.assignedToId ?? '');
      if (entry) {
        entry.activeTasks = row._count._all;
      }
    }
    return counts;
  }

  /** Who was assigned on earlier attempts, so the router does not offer them the same ticket twice. */
  async previouslyAssigned(organizationId: string, ticketId: string): Promise<string[]> {
    const rows = await this.prisma.ticketRoutingTrail.findMany({
      where: { organizationId, ticketId, accepted: true },
      select: { candidateUserId: true },
    });
    return rows.map((row) => row.candidateUserId).filter((id): id is string => id !== null);
  }
}
