import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';
import type { Prisma, RcaStatus } from '../../generated/prisma/client';

/**
 * Root-cause analysis data access.
 *
 * One report per problem — the unique index on `problem_id` is what makes that true — so every
 * lookup here is by problem or by report id, and both name `organizationId`.
 */
@Injectable()
export class RcaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The report and the problem it belongs to, which is what every decision here needs. */
  findWithProblem(organizationId: string, id: string) {
    return this.prisma.rcaReport.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        status: true,
        problemId: true,
        problem: { select: { id: true, status: true, organizationId: true } },
      },
    });
  }

  /**
   * Writes the answers, conditional on the report still being in the state the caller checked.
   *
   * `updateMany` for the same reason the transitions elsewhere use it: the check ran against a row
   * read a moment ago, and two people submitting the same form should not both believe they won.
   */
  async save(input: {
    organizationId: string;
    problemId: string;
    expect: RcaStatus[];
    data: Prisma.RcaReportUncheckedUpdateInput;
  }): Promise<boolean> {
    const saved = await this.prisma.rcaReport.updateMany({
      where: {
        problemId: input.problemId,
        organizationId: input.organizationId,
        status: { in: input.expect },
      },
      data: input.data,
    });
    return saved.count > 0;
  }

  /** Creates the empty form when a submission arrives before anybody pressed "Request RCA". */
  async ensureDraft(organizationId: string, problemId: string): Promise<void> {
    await this.prisma.rcaReport.upsert({
      where: { problemId },
      update: {},
      create: { organizationId, problemId },
    });
  }

  findRelease(organizationId: string, releaseId: string): Promise<{ id: string } | null> {
    return this.prisma.release.findFirst({
      where: { id: releaseId, organizationId, deletedAt: null },
      select: { id: true },
    });
  }

  findMember(organizationId: string, userId: string): Promise<{ userId: string } | null> {
    return this.prisma.organizationMembership.findFirst({
      where: { organizationId, userId, deletedAt: null },
      select: { userId: true },
    });
  }
}
