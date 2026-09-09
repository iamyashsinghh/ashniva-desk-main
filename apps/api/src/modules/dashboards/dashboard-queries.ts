import {
  CONTRACT_EXPIRY_WARNING_DAYS,
  OPEN_CHANGE_REQUEST_STATUSES,
  OPEN_TASK_STATUSES,
  OPEN_TICKET_STATUSES,
  PRIORITY,
  TASK_STATUS,
  TICKET_STATUS,
  type TaskStatus,
  type TaskSummary,
  type TicketSummary,
  type WorkloadEntry,
} from '@ashniva/types';

import type { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { slaTicketWhere, type SlaRisk } from '../sla-escalations/sla-ticket-filter';
import { teamPeerIds } from '../tasks/task-list-filter';
import { todayUtc, toTaskSummary } from '../tasks/tasks.mapper';
import { taskSummaryInclude } from '../tasks/tasks.repository';
import { toTicketSummary } from '../tickets/tickets.mapper';
import { ticketSummaryInclude } from '../tickets/tickets.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DashboardContext {
  organizationId: string;
  userId: string;
  today: Date;
  tomorrow: Date;
}

export function dashboardContext(organizationId: string, userId: string): DashboardContext {
  // The same "today" the task list uses, so a card's count and its destination cannot disagree
  // about which tasks are past due.
  const today = todayUtc();
  return { organizationId, userId, today, tomorrow: new Date(today.getTime() + DAY_MS) };
}

export const OPEN_TASKS = [...OPEN_TASK_STATUSES];
export const OPEN_TICKETS = [...OPEN_TICKET_STATUSES];

/** Shared query helpers so every dashboard counts the same things the same way. */
export class DashboardQueries {
  constructor(
    private readonly prisma: PrismaService,
    readonly ctx: DashboardContext,
    /**
     * The caller's task scope from `TaskVisibilityService`, or undefined for an organization-wide
     * reader. Applied to every task query here rather than to individual cards: a KPI and the list
     * it opens are the same question asked twice, so they have to be narrowed in the same place or
     * the card starts counting rows its own link will not show.
     */
    private readonly visibility?: Prisma.TaskWhereInput,
  ) {}

  /**
   * The tenant predicate, the caller's, and their task scope.
   *
   * `organizationId` comes **after** the spread on purpose. With the spread last, a caller passing
   * an `organizationId` of its own — by accident, or by threading a value in from a request —
   * would silently replace the one taken from the session. No caller does that today; the ordering
   * is what keeps it that way.
   *
   * The scope is `AND`-ed around the result rather than spread into it, because several callers
   * pass an `OR` of their own and a spread would drop one of the two.
   */
  taskWhere(extra: Prisma.TaskWhereInput = {}): Prisma.TaskWhereInput {
    const base: Prisma.TaskWhereInput = {
      deletedAt: null,
      ...extra,
      organizationId: this.ctx.organizationId,
    };
    return this.visibility ? { AND: [base, this.visibility] } : base;
  }

  ticketWhere(extra: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput {
    return { deletedAt: null, ...extra, organizationId: this.ctx.organizationId };
  }

  countTasks(extra: Prisma.TaskWhereInput = {}): Promise<number> {
    return this.prisma.task.count({ where: this.taskWhere(extra) });
  }

  countTickets(extra: Prisma.TicketWhereInput = {}): Promise<number> {
    return this.prisma.ticket.count({ where: this.ticketWhere(extra) });
  }

  /**
   * Task counts per status in one grouped query.
   *
   * The alternative is one `count()` per status, and the operational dashboard reports seven of
   * them; a grid of counts is exactly what `groupBy` is for.
   */
  async groupTasksByStatus(extra: Prisma.TaskWhereInput = {}): Promise<Map<TaskStatus, number>> {
    const rows = await this.prisma.task.groupBy({
      by: ['status'],
      where: this.taskWhere(extra),
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.status as TaskStatus, row._count._all]));
  }

  async tasks(
    extra: Prisma.TaskWhereInput,
    take = 10,
    orderBy: Prisma.TaskOrderByWithRelationInput[] = [],
  ): Promise<TaskSummary[]> {
    const rows = await this.prisma.task.findMany({
      where: this.taskWhere(extra),
      include: taskSummaryInclude,
      orderBy: [
        ...orderBy,
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { priority: 'desc' },
        { updatedAt: 'desc' },
      ],
      take,
    });
    return rows.map((row) => toTaskSummary(row, this.ctx.today));
  }

  async tickets(extra: Prisma.TicketWhereInput, take = 10): Promise<TicketSummary[]> {
    const rows = await this.prisma.ticket.findMany({
      where: this.ticketWhere(extra),
      include: ticketSummaryInclude,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take,
    });
    return rows.map(toTicketSummary);
  }

  overdue(extra: Prisma.TaskWhereInput = {}): Prisma.TaskWhereInput {
    return { ...extra, dueDate: { lt: this.ctx.today }, status: { in: OPEN_TASKS } };
  }

  completedToday(extra: Prisma.TaskWhereInput = {}): Prisma.TaskWhereInput {
    return {
      ...extra,
      status: TASK_STATUS.COMPLETED,
      completedAt: { gte: this.ctx.today, lt: this.ctx.tomorrow },
    };
  }

  /** Tickets actually resolved today — the set GET /tickets?view=resolved&resolvedToday=true lists. */
  resolvedToday(): Prisma.TicketWhereInput {
    return {
      status: { in: [TICKET_STATUS.RESOLVED, TICKET_STATUS.CLOSED] },
      resolvedAt: { gte: this.ctx.today, lt: this.ctx.tomorrow },
    };
  }

  criticalOpenTickets(): Prisma.TicketWhereInput {
    return { priority: PRIORITY.CRITICAL, status: { in: OPEN_TICKETS } };
  }

  /** Open tickets past their SLA warning or due time — the same set GET /tickets?view=sla-* lists. */
  slaTickets(kind: SlaRisk, now = new Date()): Prisma.TicketWhereInput {
    return slaTicketWhere(kind, now);
  }

  countExpiringContracts(now = new Date()): Promise<number> {
    return this.prisma.contract.count({
      where: {
        organizationId: this.ctx.organizationId,
        deletedAt: null,
        status: 'ACTIVE',
        endDate: { gte: now, lte: new Date(now.getTime() + CONTRACT_EXPIRY_WARNING_DAYS * DAY_MS) },
      },
    });
  }

  countApprovalsWaitingClient(): Promise<number> {
    return this.prisma.approvalRequest.count({
      where: { organizationId: this.ctx.organizationId, deletedAt: null, status: 'PUBLISHED' },
    });
  }

  countOpenChangeRequests(): Promise<number> {
    return this.prisma.changeRequest.count({
      where: {
        organizationId: this.ctx.organizationId,
        deletedAt: null,
        status: { in: [...OPEN_CHANGE_REQUEST_STATUSES] },
      },
    });
  }

  /** SLA-risk tickets ordered by the nearest deadline. */
  async slaTicketList(take = 10): Promise<TicketSummary[]> {
    const rows = await this.prisma.ticket.findMany({
      where: this.ticketWhere(this.slaTickets('at-risk')),
      include: ticketSummaryInclude,
      orderBy: [{ sla: { resolutionDueAt: 'asc' } }, { priority: 'desc' }],
      take,
    });
    return rows.map(toTicketSummary);
  }

  async minutesToday(userIds: string[]): Promise<Map<string, number>> {
    if (userIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.workLog.groupBy({
      by: ['userId'],
      where: {
        organizationId: this.ctx.organizationId,
        userId: { in: userIds },
        workDate: this.ctx.today,
      },
      _sum: { minutes: true },
    });
    return new Map(rows.map((row) => [row.userId, row._sum.minutes ?? 0]));
  }

  /** Open / in-progress / review / overdue / blocked per person plus minutes logged today. */
  async workload(userIds?: string[]): Promise<WorkloadEntry[]> {
    const members = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: this.ctx.organizationId,
        deletedAt: null,
        user: { deletedAt: null, status: 'ACTIVE' },
        ...(userIds ? { userId: { in: userIds } } : {}),
        role: { key: { in: ['DEVELOPER', 'TESTER', 'TEAM_LEAD', 'SUPPORT_EXECUTIVE'] } },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    });
    const ids = members.map((member) => member.userId);
    // Counters, not rows. This used to load every open task in the organization — three columns
    // but no `take` — and count them in JavaScript, on every manager's home screen. Both queries
    // go through `taskWhere`, so whatever that predicate grows to next is counted here too.
    const openWhere = this.taskWhere({ assignedToId: { in: ids }, status: { in: OPEN_TASKS } });
    const [byStatus, overdue, minutes] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['assignedToId', 'status'],
        where: openWhere,
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['assignedToId'],
        // `dueDate: { lt }` excludes nulls, which is what "overdue" has always meant here.
        where: { ...openWhere, dueDate: { lt: this.ctx.today } },
        _count: { _all: true },
      }),
      this.minutesToday(ids),
    ]);
    const counts = new Map<string, Map<string, number>>();
    for (const row of byStatus) {
      if (!row.assignedToId) {
        continue;
      }
      const forUser = counts.get(row.assignedToId) ?? new Map<string, number>();
      forUser.set(row.status, row._count._all);
      counts.set(row.assignedToId, forUser);
    }
    const overdueByUser = new Map(
      overdue.flatMap((row) => (row.assignedToId ? [[row.assignedToId, row._count._all]] : [])),
    );
    return members.map((member) => {
      const mine = counts.get(member.userId) ?? new Map<string, number>();
      let openTasks = 0;
      for (const value of mine.values()) {
        openTasks += value;
      }
      return {
        user: member.user,
        title: member.title,
        openTasks,
        inProgress: mine.get(TASK_STATUS.IN_PROGRESS) ?? 0,
        inReview: mine.get(TASK_STATUS.IN_REVIEW) ?? 0,
        overdue: overdueByUser.get(member.userId) ?? 0,
        blocked: mine.get(TASK_STATUS.BLOCKED) ?? 0,
        minutesToday: minutes.get(member.userId) ?? 0,
      };
    });
  }

  /**
   * The people a lead oversees: their team peers without themselves.
   *
   * Derived from `teamPeerIds` rather than asking the database a second, subtly different
   * question. Both used to be called `teamMemberIds` and differed by this one line, so a call site
   * gave no clue which answer it was getting.
   */
  async teamPeersExcludingSelf(userId: string): Promise<string[]> {
    const ids = await teamPeerIds(this.prisma, this.ctx.organizationId, userId);
    return ids.filter((id) => id !== userId);
  }
}
