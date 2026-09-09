import { Injectable } from '@nestjs/common';
import type { TesterView, TesterViewCounts } from '@ashniva/types';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, TestingAssignmentStatus } from '../../generated/prisma/client';
import { TESTER_VIEWS, testerViewWhere, type TesterViewScope } from './tester-views';
import { testAccountFields } from './test-accounts.repository';

const userRef = { select: { id: true, name: true } } as const;

const assignmentSummaryInclude = {
  project: { select: { id: true, code: true, name: true } },
  task: { select: { id: true, number: true, title: true, project: { select: { code: true } } } },
  ticket: { select: { id: true, number: true, title: true } },
  release: { select: { id: true, version: true, title: true } },
  assignedTo: userRef,
} satisfies Prisma.TestingAssignmentInclude;

/**
 * The detail adds the payload a tester needs, the login to use and the results so far.
 *
 * `testAccount` joins through `testAccountFields` — the shared no-secret select — rather than a
 * bare `include`. An `include` would pull `secretCiphertext` into the row type, and from there one
 * careless spread reaches a response. The column is not in this shape at all.
 */
const assignmentDetailInclude = {
  ...assignmentSummaryInclude,
  assignedBy: userRef,
  testAccount: { select: testAccountFields },
  results: {
    include: { recordedBy: userRef },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.TestingAssignmentInclude;

export type AssignmentSummaryRow = Prisma.TestingAssignmentGetPayload<{
  include: typeof assignmentSummaryInclude;
}>;
export type AssignmentDetailRow = Prisma.TestingAssignmentGetPayload<{
  include: typeof assignmentDetailInclude;
}>;

export interface RecordResultInput {
  organizationId: string;
  assignmentId: string;
  recordedById: string;
  status: TestingAssignmentStatus;
  completedAt: Date | null;
  result: Omit<
    Prisma.TestResultUncheckedCreateInput,
    'organizationId' | 'assignmentId' | 'recordedById'
  >;
}

/**
 * Testing-assignment data access. Every query carries `organizationId`; the row-level-security
 * policies are the backstop, not the filter.
 */
@Injectable()
export class QaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Soonest deadline first, then oldest, so the queue is the order to work in. */
  listForView(
    view: TesterView,
    scope: TesterViewScope,
    limit: number,
  ): Promise<AssignmentSummaryRow[]> {
    return this.prisma.testingAssignment.findMany({
      where: testerViewWhere(view, scope),
      include: assignmentSummaryInclude,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: limit,
    });
  }

  /**
   * One count per view, on one connection.
   *
   * The nine views are nine unrelated predicates — `testerViewWhere` is deliberately the only
   * place they are written, so that a card and the list it opens cannot disagree — and there is
   * no single `groupBy` that answers all nine. What there was instead was nine `count()` calls
   * under `Promise.all`, which took nine connections out of a pool of eleven, plus a tenth for
   * the list, for every /qa/assignments request.
   *
   * Prisma's array form of `$transaction` is a batch, not an interactive transaction: it checks
   * out one connection and runs the nine on it. So the round trip the old comment claimed is now
   * true, the request occupies one connection instead of ten, and the nine counts additionally
   * come from one snapshot rather than nine — which is what stops two cards disagreeing about a
   * row that moved between them.
   */
  async countViews(scope: TesterViewScope): Promise<TesterViewCounts> {
    const counts = await this.prisma.$transaction(
      TESTER_VIEWS.map((view) =>
        this.prisma.testingAssignment.count({ where: testerViewWhere(view, scope) }),
      ),
    );
    return Object.fromEntries(
      TESTER_VIEWS.map((view, index) => [view, counts[index] ?? 0]),
    ) as TesterViewCounts;
  }

  findDetail(
    organizationId: string,
    id: string,
    visibility?: Prisma.TestingAssignmentWhereInput,
  ): Promise<AssignmentDetailRow | null> {
    return this.prisma.testingAssignment.findFirst({
      where: { id, organizationId, deletedAt: null, ...(visibility ? { AND: visibility } : {}) },
      include: assignmentDetailInclude,
    });
  }

  create(
    organizationId: string,
    data: Omit<Prisma.TestingAssignmentUncheckedCreateInput, 'organizationId'>,
  ): Promise<AssignmentDetailRow> {
    return this.prisma.testingAssignment.create({
      data: { ...data, organizationId },
      include: assignmentDetailInclude,
    });
  }

  update(
    organizationId: string,
    id: string,
    data: Prisma.TestingAssignmentUncheckedUpdateInput,
  ): Promise<AssignmentDetailRow> {
    return this.prisma.testingAssignment.update({
      where: { id, organizationId },
      data,
      include: assignmentDetailInclude,
    });
  }

  /**
   * The result and the new status in one transaction: a recorded failure that left the assignment
   * in progress, or a status change with no evidence behind it, are both worse than neither.
   */
  async recordResult(input: RecordResultInput): Promise<AssignmentDetailRow> {
    const [, assignment] = await this.prisma.$transaction([
      this.prisma.testResult.create({
        data: {
          ...input.result,
          organizationId: input.organizationId,
          assignmentId: input.assignmentId,
          recordedById: input.recordedById,
        },
      }),
      this.prisma.testingAssignment.update({
        where: { id: input.assignmentId, organizationId: input.organizationId },
        data: { status: input.status, completedAt: input.completedAt },
        include: assignmentDetailInclude,
      }),
    ]);
    return assignment;
  }

  /**
   * Referential check for the thing being tested: same tenant, and the same project.
   *
   * The project matters as much as the tenant. Everything else about an assignment is scoped by
   * `projectId` — the test account it may carry is checked against it, the queue is filtered by it
   * — so an assignment whose subject lives in a different project hands a tester one project's
   * staging login while pointing them at another project's work. Those two projects usually belong
   * to different clients, which makes it a client boundary and not merely untidy.
   *
   * It also matters to the release gates: `qaState` counts assignments by the task and ticket ids
   * a release carries, without looking at the assignment's own project, so a stray assignment
   * could satisfy or block a release it has nothing to do with.
   *
   * A ticket with no project at all is still allowed: support tickets are raised before anyone
   * knows which project they belong to, and refusing to test one would be the wrong answer.
   */
  async subjectExists(
    organizationId: string,
    projectId: string,
    subject: { taskId?: string; ticketId?: string; releaseId?: string },
  ): Promise<boolean> {
    if (subject.taskId) {
      return (
        (await this.prisma.task.count({
          where: { id: subject.taskId, organizationId, projectId, deletedAt: null },
        })) > 0
      );
    }
    if (subject.ticketId) {
      return (
        (await this.prisma.ticket.count({
          where: {
            id: subject.ticketId,
            organizationId,
            OR: [{ projectId }, { projectId: null }],
            deletedAt: null,
          },
        })) > 0
      );
    }
    if (subject.releaseId) {
      return (
        (await this.prisma.release.count({
          where: { id: subject.releaseId, organizationId, projectId, deletedAt: null },
        })) > 0
      );
    }
    return false;
  }
}
