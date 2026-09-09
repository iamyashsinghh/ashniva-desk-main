import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, ProblemStatus } from '../../generated/prisma/client';
import {
  createProblemIn,
  problemDetailInclude,
  problemSummaryInclude,
  type NewProblem,
  type ProblemDetailRow,
  type ProblemSummaryRow,
} from './problems.shape';

// Re-exported so the services and mappers that read a problem row keep naming the repository they
// read it from, rather than reaching past it for the shape it was read with.
export {
  problemDetailInclude,
  problemSummaryInclude,
  type NewProblem,
  type ProblemDetailRow,
  type ProblemSummaryRow,
};

export interface ProblemListFilter {
  organizationId: string;
  status?: ProblemStatus[];
  projectId?: string;
  productId?: string;
  ownerId?: string;
  search?: string;
  limit: number;
  cursor?: string;
}

export interface ProblemPage {
  items: ProblemSummaryRow[];
  nextCursor: string | null;
  total: number;
}

/**
 * Problem data access. Every query names `organizationId`, the writes included: a scoped read
 * followed by an unscoped `update` by id is one refactor away from writing across tenants.
 *
 * Rows hanging off a problem — links, questions, the RCA draft — are reached through a problem
 * the caller has already been scoped to, which is why they are addressed by `problemId` here.
 */
@Injectable()
export class ProblemsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ProblemListFilter): Promise<ProblemPage> {
    const search = filter.search?.trim();
    const where: Prisma.ProblemWhereInput = {
      organizationId: filter.organizationId,
      ...(filter.status?.length ? { status: { in: filter.status } } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.productId ? { productId: filter.productId } : {}),
      ...(filter.ownerId ? { ownerId: filter.ownerId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { module: { contains: search, mode: 'insensitive' } },
              ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.problem.count({ where }),
      this.prisma.problem.findMany({
        where,
        include: problemSummaryInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: filter.limit + 1,
        ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > filter.limit;
    const items = hasMore ? rows.slice(0, filter.limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, total };
  }

  findDetail(organizationId: string, id: string): Promise<ProblemDetailRow | null> {
    return this.prisma.problem.findFirst({
      where: { id, organizationId },
      include: problemDetailInclude,
    });
  }

  /** Open problems the recurring dashboard groups; the whole set, because it groups in memory. */
  findOpen(organizationId: string, statuses: ProblemStatus[]) {
    return this.prisma.problem.findMany({
      where: { organizationId, status: { in: statuses } },
      select: {
        id: true,
        number: true,
        status: true,
        productId: true,
        module: true,
        severity: true,
        versions: true,
      },
    });
  }

  /** Opens a problem somebody asked for by name, numbering it in the same transaction. */
  create(organizationId: string, data: NewProblem): Promise<ProblemDetailRow> {
    return this.prisma.$transaction((tx) => createProblemIn(tx, organizationId, data));
  }

  /**
   * The problem a group of tickets belongs to: the one they already point at, or a new one.
   *
   * Read and write in one transaction, behind an advisory lock on the group. Two support
   * executives confirming different candidates on the same ticket within a second both read
   * `problemId = null` and both create, and nothing in the schema can arbitrate: "one problem per
   * unlinked group" is not a shape a unique index can express, since a group is a set of tickets
   * that do not point anywhere yet. The consequence is not cosmetic — the two problems split the
   * client count between them, so the "three separate clients reported this" alert, which is the
   * feature, never fires.
   *
   * `pg_advisory_xact_lock` is the smallest thing that works: it is held until the transaction
   * ends, it needs no row to lock, and it costs one round trip. Collisions between different
   * groups that happen to hash alike are harmless — the loser waits for one create.
   *
   * The tickets are pointed at the new problem here, in the same transaction, and not left to the
   * link that follows. That pointer is what the next caller's re-read looks at: written later, it
   * would leave a gap between the lock being released and the group looking taken, and a second
   * decision arriving inside that gap would create the second problem this method exists to
   * prevent. The link rows follow immediately and carry the relation and who made it.
   */
  async findOrCreateForGroup(input: {
    organizationId: string;
    /** What makes this group this group; see `groupLockKey`. */
    lockKey: string;
    ticketIds: string[];
    data: NewProblem;
  }): Promise<{ row: ProblemDetailRow | null; problemId: string; created: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      // `$executeRaw`, not `$queryRaw`: the function returns `void`, which the driver adapter
      // refuses to deserialize as a column. Nothing is being read here anyway.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.lockKey}))`;
      const linked = await tx.ticket.findFirst({
        where: {
          id: { in: input.ticketIds },
          organizationId: input.organizationId,
          deletedAt: null,
          problemId: { not: null },
        },
        select: { problemId: true },
      });
      if (linked?.problemId) {
        return { row: null, problemId: linked.problemId, created: false };
      }
      const row = await createProblemIn(tx, input.organizationId, input.data);
      await tx.ticket.updateMany({
        where: {
          id: { in: input.ticketIds },
          organizationId: input.organizationId,
          deletedAt: null,
        },
        data: { problemId: row.id },
      });
      return { row, problemId: row.id, created: true };
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: Prisma.ProblemUncheckedUpdateInput,
  ): Promise<void> {
    await this.prisma.problem.updateMany({ where: { id, organizationId }, data });
  }

  /**
   * Moves the status, conditional on it still being what the caller checked.
   *
   * `updateMany` rather than read-then-`update`: the workflow check ran against a row read a
   * moment ago, so two people pressing Close at the same time both reach here. Matching on the
   * expected status means the second one matches nothing and is told so. `false` is the 409.
   */
  async transition(input: {
    organizationId: string;
    id: string;
    from: ProblemStatus;
    to: ProblemStatus;
    data?: Prisma.ProblemUncheckedUpdateInput;
  }): Promise<boolean> {
    const claimed = await this.prisma.problem.updateMany({
      where: { id: input.id, organizationId: input.organizationId, status: input.from },
      data: { ...input.data, status: input.to },
    });
    return claimed.count > 0;
  }

  /**
   * Links a group of tickets to a problem, in one transaction with their own pointers.
   *
   * Both sides are written: the link rows carry the relation and who made it, and
   * `tickets.problem_id` is what the ticket screen and the candidate query read. Writing only one
   * of them would leave a ticket that a problem lists but that does not know it belongs to one.
   *
   * The whole group in one transaction, rather than a transaction per ticket. Twenty tickets was
   * twenty round trips, and a failure at the tenth left a problem half linked — a state nothing
   * reconciles, and one that quietly changes the client count the threshold is read from.
   *
   * `updateMany` before `createMany` is what keeps this an upsert: the pairs that already exist
   * take the new relation, and `skipDuplicates` then inserts only the ones that were missing.
   */
  linkTickets(input: {
    organizationId: string;
    problemId: string;
    ticketIds: string[];
    relation: 'DUPLICATE' | 'RELATED';
    linkedById: string;
  }): Promise<void> {
    if (input.ticketIds.length === 0) {
      return Promise.resolve();
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.problemTicket.updateMany({
        where: { problemId: input.problemId, ticketId: { in: input.ticketIds } },
        data: { relation: input.relation },
      });
      await tx.problemTicket.createMany({
        data: input.ticketIds.map((ticketId) => ({
          organizationId: input.organizationId,
          problemId: input.problemId,
          ticketId,
          relation: input.relation,
          linkedById: input.linkedById,
        })),
        skipDuplicates: true,
      });
      await tx.ticket.updateMany({
        where: {
          id: { in: input.ticketIds },
          organizationId: input.organizationId,
          deletedAt: null,
        },
        data: { problemId: input.problemId },
      });
    });
  }

  /** The tickets a caller named, scoped to the provider, with what a problem is built from. */
  findTickets(organizationId: string, ticketIds: string[]) {
    return this.prisma.ticket.findMany({
      where: { id: { in: ticketIds }, organizationId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        productId: true,
        module: true,
        productVersion: true,
        clientOrganizationId: true,
        problemId: true,
        priority: true,
        title: true,
      },
    });
  }

  /** A task on this provider, for the permanent-fix and preventive-test links. */
  findTask(organizationId: string, taskId: string) {
    return this.prisma.task.findFirst({
      where: { id: taskId, organizationId, deletedAt: null },
      select: { id: true, status: true, title: true },
    });
  }

  /**
   * A problem inside the caller's tenant, without loading everything hanging off it.
   *
   * Used wherever a caller *names* a problem to write into. `linkTicket` scopes its ticket update
   * but the link row itself only carries the organization it is told about, so a problem id that
   * arrived in a request has to be resolved inside the tenant before anything is written against
   * it — otherwise one provider could file a ticket into another provider's problem.
   */
  findRef(organizationId: string, id: string): Promise<{ id: string } | null> {
    return this.prisma.problem.findFirst({ where: { id, organizationId }, select: { id: true } });
  }

  /** An internal colleague, for the owner fields. Membership of the provider is the check. */
  findMember(organizationId: string, userId: string): Promise<{ userId: string } | null> {
    return this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, deletedAt: null },
      select: { userId: true },
    });
  }

  /** Support routing settings for the project a problem belongs to; null when none is configured. */
  findOwnership(organizationId: string, projectId: string) {
    return this.prisma.supportOwnership.findFirst({
      where: { projectId, organizationId },
      select: { seniorId: true, duplicateThreshold: true, similarityEnabled: true },
    });
  }

  createQuestion(data: {
    organizationId: string;
    problemId: string;
    body: string;
    askedById: string;
  }): Promise<{ id: string }> {
    return this.prisma.problemQuestion.create({ data, select: { id: true } });
  }

  /** Answers a question, scoped by its problem so an id from another problem matches nothing. */
  async answerQuestion(input: {
    organizationId: string;
    problemId: string;
    questionId: string;
    answer: string;
    answeredById: string;
  }): Promise<boolean> {
    const answered = await this.prisma.problemQuestion.updateMany({
      where: {
        id: input.questionId,
        problemId: input.problemId,
        organizationId: input.organizationId,
      },
      data: {
        answer: input.answer,
        answeredById: input.answeredById,
        answeredAt: new Date(),
      },
    });
    return answered.count > 0;
  }

  /** The empty RCA form a request creates, or the one that already exists. */
  async ensureRcaDraft(organizationId: string, problemId: string): Promise<void> {
    await this.prisma.rcaReport.upsert({
      where: { problemId },
      update: {},
      create: { organizationId, problemId },
    });
  }
}
